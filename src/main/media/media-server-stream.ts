import http from 'http';
import https from 'https';
import { logger } from '../../shared/logger';
import { createPinnedLookup, resolveNetworkTarget } from '../ipc/network-target';
import {
  isRegisteredGenericStreamUrl,
  getProviderStreamFactory
} from './media-server-stream-registry';
import { detectProviderLimit, formatProviderLimit } from '../ipc/providers/provider-limits';
import {
  isAllowedRadioHost,
  validateStreamUrl,
  STREAM_MAX_REDIRECTS,
  STREAM_MAX_ATTEMPTS,
  STREAM_RETRY_DELAYS,
  STREAM_TIMEOUT_MS,
  STREAM_USER_AGENT,
  sleep
} from './media-server-guards';

function streamProxyRequest(
  method: string,
  upstreamUrl: URL,
  range?: string,
  attempt = 0,
  lookup?: https.RequestOptions['lookup']
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = upstreamUrl.protocol === 'https:' ? https : http;
    const headers: http.OutgoingHttpHeaders = {
      'User-Agent': STREAM_USER_AGENT,
      Accept: '*/*'
    };
    if (range) headers.range = range;

    // URL-e odtwarzania googlevideo są podpisane dla IP klienta (`ip=` param).
    // URL pochodzi z yt-dlp, które połączyło się z TĄ SAMĄ rodziną co
    // `ip=` — ale autoSelectFamily Node'a zwykle wygrywa z IPv4, więc
    // URL podpisany dla v6 dostaje 403. Wymuś podpisaną rodzinę; próba ponowienia
    // przechodzi do drugiej rodziny (np. gdy v6 jest nieosiągalny).
    const ipParam = upstreamUrl.searchParams.get('ip') || '';
    const signedFamily = ipParam.includes(':') ? 6 : ipParam ? 4 : 0;
    const opts: https.RequestOptions = {
      headers,
      method: method === 'HEAD' ? 'HEAD' : 'GET'
    };
    if (lookup) opts.lookup = lookup;
    if (signedFamily) {
      opts.family = attempt === 0 ? signedFamily : signedFamily === 6 ? 4 : 6;
    }

    const upstreamReq = mod.get(upstreamUrl, opts, (upRes) => resolve(upRes));
    upstreamReq.setTimeout(STREAM_TIMEOUT_MS, () => upstreamReq.destroy(new Error('timeout')));
    upstreamReq.on('error', reject);
  });
}

// Proksuje /{token}/stream?url=... do rozwiązanego URL-a audio z yt-dlp.
// Żądanie upstream nie niesie Referer/Origin (jak zwykły odtwarzacz), Range jest
// przekazywany, aby przewijanie <audio> działało, a treść jest strumieniowana bez zmian.
export async function handleStreamProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  rawUrl: string
): Promise<void> {
  const startTs = Date.now();
  if (!rawUrl) {
    res.writeHead(400);
    res.end('missing url');
    return;
  }
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    res.writeHead(400);
    res.end('invalid url');
    return;
  }
  const generic = isRegisteredGenericStreamUrl(current.href);
  let originalProtocol = current.protocol;
  if (!generic && !validateStreamUrl(current.toString())) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  logger.info(
    'media-server',
    `stream proxy ${req.method} host=${current.hostname} range=${req.headers.range ?? 'none'}`
  );

  for (let hop = 0; hop <= STREAM_MAX_REDIRECTS; hop++) {
    let lookup: https.RequestOptions['lookup'];
    // Stacja dodana przez użytkownika może znajdować się w jego LAN (serwer radia
    // pod 192.168.x.x to realny przypadek), ale /stream jest osiągalne z renderera,
    // więc stacja nie może stać się forwarderem do loopbacku lub endpointu metadanych
    // chmury — a nazwa hosta z rebindingiem nie może zmienić tego, co już zwalidowaliśmy.
    // Oba wymagają rozwiązania i przypięcia adresu.
    const isUserStation = !generic && isAllowedRadioHost(current.hostname);
    if (generic || isUserStation) {
      try {
        const target = await resolveNetworkTarget(current.toString(), {
          allowPrivateNetwork: isUserStation,
          blockLoopback: isUserStation
        });
        current = target.url;
        lookup = createPinnedLookup(target.addresses);
      } catch (e) {
        logger.warn('media-server', `stream target rejected host=${current.hostname}`, e);
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
    }
    if (!generic) {
      const validated = validateStreamUrl(current.toString());
      if (!validated) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      current = validated;
    }

    for (let attempt = 0; attempt < STREAM_MAX_ATTEMPTS; attempt++) {
      let upRes: http.IncomingMessage;
      try {
        upRes = await streamProxyRequest(
          req.method || 'GET',
          current,
          req.headers.range,
          attempt,
          lookup
        );
      } catch (e) {
        const err = e as { message?: string };
        logger.warn(
          'media-server',
          `stream upstream failed attempt=${attempt + 1}: ${err.message ?? ''}`
        );
        if (attempt < STREAM_MAX_ATTEMPTS - 1) {
          await sleep(STREAM_RETRY_DELAYS[attempt]);
          continue;
        }
        res.writeHead(502);
        res.end('upstream error');
        return;
      }

      const status = upRes.statusCode || 0;
      logger.info(
        'media-server',
        `stream upstream status=${status} type=${upRes.headers['content-type'] ?? '?'} ms=${Date.now() - startTs}`
      );
      if (status >= 300 && status < 400 && upRes.headers.location) {
        upRes.destroy();
        try {
          const redirected = new URL(upRes.headers.location, current);
          if (generic && originalProtocol === 'https:' && redirected.protocol !== 'https:') {
            res.writeHead(403);
            res.end('forbidden');
            return;
          }
          current = redirected;
          originalProtocol = current.protocol;
        } catch {
          res.writeHead(502);
          res.end('bad redirect');
          return;
        }
        break;
      }
      if (status !== 200 && status !== 206) {
        let body = '';
        upRes.on('data', (chunk: Buffer) => {
          if (body.length < 400) body += chunk.toString('utf8');
        });
        await new Promise<void>((r) => {
          upRes.on('end', () => r());
          upRes.on('error', () => r());
        });
        logger.warn(
          'media-server',
          `stream upstream bad status=${status} body=${body.slice(0, 400)}`
        );
        upRes.destroy();
        if (attempt < STREAM_MAX_ATTEMPTS - 1) {
          // 403 z googlevideo są zwykle przejściowe (throttling per-IP na
          // współdzielonym adresie CGNAT); krótka zwłoka między próbami często wystarcza.
          await sleep(STREAM_RETRY_DELAYS[attempt]);
          continue;
        }
        res.writeHead(502);
        res.end('upstream error');
        return;
      }

      const headers: http.OutgoingHttpHeaders = {};
      for (const name of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control'
      ]) {
        const value = upRes.headers[name];
        if (value !== undefined) headers[name] = value;
      }
      res.writeHead(status, headers);

      req.on('close', () => {
        if (!res.writableEnded) upRes.destroy();
      });
      upRes.on('error', () => res.destroy());
      if (req.method === 'HEAD') {
        upRes.destroy();
        res.end();
      } else {
        upRes.pipe(res);
      }
      return;
    }
  }
  res.writeHead(502);
  res.end('too many redirects');
}

// Proksuje /{token}/stream?provider=<token> do strumienia providera (np. MEGA),
// deszyfrowanego w procesie głównym (z obsługą Range 206).
export async function handleProviderStreamProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  token: string
): Promise<void> {
  if (!token) {
    res.writeHead(400);
    res.end('missing provider token');
    return;
  }
  const factory = getProviderStreamFactory(token);
  if (!factory) {
    res.writeHead(404);
    res.end('unknown provider stream');
    return;
  }
  // Zakresy bajtów (przewijanie wideo): `bytes=start-end` / `bytes=start-`.
  let range: { start: number; end?: number } | undefined;
  const rangeHeader = req.headers.range;
  if (typeof rangeHeader === 'string') {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (m) range = { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined };
  }

  let stream: NodeJS.ReadableStream;
  let mime = 'application/octet-stream';
  let size: number | undefined;
  try {
    const resolved = await factory(range);
    stream = resolved.stream;
    if (resolved.mime) mime = resolved.mime;
    size = resolved.size;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const limit = detectProviderLimit(msg);
    if (limit.limited) {
      const formatted = formatProviderLimit(limit);
      logger.warn('media-server', `provider limit: ${formatted}`);
      // Powiadom UI (widok przełącza się na player — bez tego limit ginie w ciszy).
      void (async () => {
        try {
          const { broadcastToAllWindows } = await import('../utils/broadcast');
          broadcastToAllWindows('providers:limit', {
            message: formatted,
            retryAfterSeconds: limit.retryAfterSeconds
          });
        } catch {
          /* brak okien / brak Electrona (testy) */
        }
      })();
      res.writeHead(429, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...(limit.retryAfterSeconds ? { 'Retry-After': String(limit.retryAfterSeconds) } : {})
      });
      res.end(`provider limit: ${formatted}`);
      return;
    }
    logger.warn('media-server', 'provider stream failed', e);
    res.writeHead(502);
    res.end('provider stream error');
    return;
  }
  logger.info(
    'media-server',
    `provider stream mime=${mime} size=${size ?? '?'} range=${req.headers.range ?? 'none'}`
  );
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  };
  let status = 200;
  if (range) {
    status = 206;
    const end = range.end ?? (size !== undefined ? size - 1 : range.start);
    if (size !== undefined) headers['Content-Range'] = `bytes ${range.start}-${end}/${size}`;
    headers['Content-Length'] = String(Math.max(0, end - range.start + 1));
  } else if (size !== undefined) {
    headers['Content-Length'] = String(size);
  }
  res.writeHead(status, headers);
  req.on('close', () => {
    try {
      (stream as import('stream').Readable).destroy?.();
    } catch {
      /* już zamknięty */
    }
  });
  (stream as import('stream').Readable).on('error', (e) => {
    // Zerwanie przez klienta (zmiana zakresu/przewijanie) niszczy strumień, a megajs
    // potrafi jeszcze dopisać chunk → „Cannot call write after a stream was destroyed".
    // To nieszkodliwy wyścig przy zamykaniu — nie logujemy go jako błąd.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/destroy|premature close|aborted|EPIPE|ECONNRESET/i.test(msg)) {
      logger.warn('media-server', 'provider stream body error', e);
    }
    res.destroy();
  });
  if (req.method === 'HEAD') {
    (stream as import('stream').Readable).destroy?.();
    res.end();
    return;
  }
  (stream as import('stream').Readable).pipe(res);
}
