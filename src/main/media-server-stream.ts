import http from 'http';
import https from 'https';
import { logger } from '../shared/logger';
import {
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
  attempt = 0
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = upstreamUrl.protocol === 'https:' ? https : http;
    const headers: http.OutgoingHttpHeaders = {
      'User-Agent': STREAM_USER_AGENT,
      Accept: '*/*'
    };
    if (range) headers.range = range;

    // googlevideo playback URLs are signed for the client IP (`ip=` param).
    // The URL is produced from yt-dlp, which connected via the SAME family as
    // `ip=` — but Node's autoSelectFamily usually wins with IPv4, so a
    // v6-signed URL gets 403'd. Force the signed family; the retry attempt
    // falls back to the other family (e.g. when v6 is unreachable).
    const ipParam = upstreamUrl.searchParams.get('ip') || '';
    const signedFamily = ipParam.includes(':') ? 6 : ipParam ? 4 : 0;
    const opts: https.RequestOptions = {
      headers,
      method: method === 'HEAD' ? 'HEAD' : 'GET'
    };
    if (signedFamily) {
      opts.family = attempt === 0 ? signedFamily : signedFamily === 6 ? 4 : 6;
    }

    const upstreamReq = mod.get(upstreamUrl, opts, (upRes) => resolve(upRes));
    upstreamReq.setTimeout(STREAM_TIMEOUT_MS, () => upstreamReq.destroy(new Error('timeout')));
    upstreamReq.on('error', reject);
  });
}

// Proxies /{token}/stream?url=... to the resolved yt-dlp audio URL. The
// upstream request carries no Referer/Origin (like a regular player), Range is
// forwarded so <audio> seeking works, and the body is streamed untouched.
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
  logger.info(
    'media-server',
    `stream proxy ${req.method} host=${current.hostname} range=${req.headers.range ?? 'none'}`
  );

  for (let hop = 0; hop <= STREAM_MAX_REDIRECTS; hop++) {
    const validated = validateStreamUrl(current.toString());
    if (!validated) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    current = validated;

    for (let attempt = 0; attempt < STREAM_MAX_ATTEMPTS; attempt++) {
      let upRes: http.IncomingMessage;
      try {
        upRes = await streamProxyRequest(req.method || 'GET', current, req.headers.range, attempt);
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
          current = new URL(upRes.headers.location, current);
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
          // googlevideo 403s are usually transient (per-IP throttling on the
          // shared CGNAT address); a short delay between tries often passes.
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
