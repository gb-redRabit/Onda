import http from 'http';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import { normalize, isAbsolute, sep } from 'path';
import { logger } from '../shared/logger';
import { getMimeType } from '../shared/mime';

export interface MediaServer {
  port: number;
  token: string;
  close: () => void;
}

// Library roots are replaced wholesale on every library change; granted roots
// (files/folders explicitly opened or download output dirs) accumulate and
// must survive restarts, so they are tracked separately and persisted.
const libraryRoots: string[] = [];
const extraRoots: string[] = [];
let rootsChanged: (() => void) | null = null;

async function resolveReal(root: string): Promise<string> {
  try {
    return await fs.promises.realpath(root);
  } catch {
    return normalize(root);
  }
}

async function resolveAll(roots: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const r of roots) {
    if (typeof r === 'string' && r) {
      resolved.push(await resolveReal(r));
    }
  }
  return resolved;
}

// Hook invoked whenever the allowed-root set changes, so the caller can persist
// the granted roots across restarts.
export function setRootsChangedHandler(cb: (() => void) | null): void {
  rootsChanged = cb;
}

// The granted (extra) roots — persisted by the app so downloads remain
// playable after a restart.
export function getExtraRoots(): string[] {
  return [...extraRoots];
}

export async function setAllowedRoots(roots: string[]): Promise<void> {
  libraryRoots.length = 0;
  libraryRoots.push(...(await resolveAll(roots)));
  rootsChanged?.();
}

export async function addAllowedRoot(root: string): Promise<void> {
  if (typeof root !== 'string' || !root) return;
  const real = await resolveReal(root);
  if (!extraRoots.includes(real)) {
    extraRoots.push(real);
    rootsChanged?.();
  }
}

function isWithinAnyRoot(filePath: string): boolean {
  for (const root of [...libraryRoots, ...extraRoots]) {
    if (isWithinRoot(filePath, root)) return true;
  }
  return false;
}

function isWithinRoot(filePath: string, root: string): boolean {
  if (process.platform === 'win32') {
    const f = filePath.toLowerCase();
    const r = root.toLowerCase();
    if (f === r) return true;
    return f.startsWith(r) && (f.charAt(r.length) === '\\' || f.charAt(r.length) === '/');
  }
  if (filePath === root) return true;
  return (
    filePath.startsWith(root) &&
    (filePath.charAt(root.length) === sep || filePath.charAt(root.length) === '/')
  );
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function allowedOrigin(origin: string | undefined): string | null {
  // Chromium sends 'null' as the literal string for file:// pages.
  if (!origin) return null;
  if (origin === 'null') return origin;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol === 'file:') return origin;
  const isLocalDev =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  return isLocalDev ? origin : null;
}

// Remote stream proxying (online playback). Only YouTube media hosts plus the
// hosts of user-added radio stations are allowed so the endpoint cannot be
// abused as an open SSRF proxy; the renderer can only ever reach it with URLs
// produced by `yt:stream:get` or stations persisted via `radio:save`.
import { isAllowedRadioHost } from './ipc/radio-store';

const STREAM_ALLOWED_HOSTS = ['googlevideo.com', 'ytimg.com', 'youtube.com', 'youtu.be'];
const STREAM_MAX_REDIRECTS = 3;
// googlevideo 403s are usually transient (per-IP throttling, flaky edge
// routing), so give each stream up to 4 attempts with a short backoff. The
// last delay is longer: throttle windows on a shared CGNAT IP can outlast the
// first two, and the 4th attempt usually lands in a fresh window.
const STREAM_MAX_ATTEMPTS = 4;
// Delay before retry attempt N (index 0 = before attempt 2, etc.).
const STREAM_RETRY_DELAYS = [400, 1200, 3000];
const STREAM_TIMEOUT_MS = 30000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function isAllowedStreamHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    STREAM_ALLOWED_HOSTS.some((suffix) => h === suffix || h.endsWith('.' + suffix)) ||
    isAllowedRadioHost(h)
  );
}

// Validates a stream target for the /stream proxy: https on an allowlisted
// YouTube media host, or http(s) on a host of a user-added radio station
// (Icecast/SHOUTcast streams are commonly plain http). Returns null when
// rejected.
export function validateStreamUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const isHttps = parsed.protocol === 'https:';
  const isHttp = parsed.protocol === 'http:';
  const isYtHost = STREAM_ALLOWED_HOSTS.some((suffix) => {
    const h = parsed.hostname.toLowerCase();
    return h === suffix || h.endsWith('.' + suffix);
  });
  if (!isHttps && !(isHttp && isAllowedRadioHost(parsed.hostname))) {
    return null;
  }
  if (!isYtHost && !isAllowedRadioHost(parsed.hostname)) {
    return null;
  }
  return parsed;
}

// Browser-like UA: some googlevideo endpoints reject requests whose
// User-Agent does not look like a browser.
const STREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
async function handleStreamProxy(
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
  logger.info('media-server', `stream proxy ${req.method} host=${current.hostname} range=${req.headers.range ?? 'none'}`);

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

export function createMediaServer(): Promise<MediaServer> {
  return new Promise((resolve, reject) => {
    const token = crypto.randomUUID();

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        const origin = allowedOrigin(req.headers.origin);
        if (req.headers.origin && origin === null) {
          res.writeHead(403);
          res.end('forbidden');
          return;
        }
        if (origin !== null) {
          res.setHeader('access-control-allow-origin', origin);
          res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
          res.setHeader(
            'access-control-allow-headers',
            req.headers['access-control-request-headers'] || '*'
          );
          res.setHeader(
            'access-control-expose-headers',
            'content-range, accept-ranges, content-length'
          );
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const pathSeg = url.pathname.replace(/^\/+/, '').split('/')[0] || '';
        if (!pathSeg || !timingSafeEqualString(pathSeg, token)) {
          res.writeHead(403);
          res.end('forbidden');
          return;
        }

        // Remote stream proxy: /{token}/stream?url=<https stream url>
        if (url.pathname.replace(/^\/+/, '').split('/')[1] === 'stream') {
          await handleStreamProxy(req, res, url.searchParams.get('url') || '');
          return;
        }

        // HEAD fast-path: return headers without reading the file.
        if (req.method === 'HEAD') {
          const rawPath = url.searchParams.get('path') || '';
          if (!rawPath) {
            res.writeHead(400);
            res.end();
            return;
          }
          try {
            const realPath = await fs.promises.realpath(rawPath);
            const stat = await fs.promises.stat(realPath);
            res.writeHead(200, {
              'content-type': getMimeType(realPath),
              'content-length': String(stat.size),
              'accept-ranges': 'bytes'
            });
            res.end();
          } catch {
            res.writeHead(404);
            res.end();
          }
          return;
        }

        const rawPath = url.searchParams.get('path') || '';
        if (!rawPath) {
          logger.warn('media-server', 'request missing path param');
          res.writeHead(400);
          res.end('missing path');
          return;
        }
        const normalized = normalize(rawPath);
        if (!isAbsolute(normalized)) {
          logger.warn('media-server', `rejected non-absolute path: ${rawPath}`);
          res.writeHead(400);
          res.end('invalid path');
          return;
        }

        let realPath = normalized;
        try {
          realPath = await fs.promises.realpath(normalized);
        } catch {
          // fall back to normalized path; root check below still applies
        }

        if (!isWithinAnyRoot(realPath)) {
          logger.warn(
            'media-server',
            `rejected path outside allowed roots: ${realPath} (roots=${libraryRoots.length + extraRoots.length})`
          );
          res.writeHead(403);
          res.end('forbidden');
          return;
        }

        const stat = await fs.promises.stat(realPath);
        const fileSize = stat.size;
        const contentType = getMimeType(realPath);
        const range = req.headers.range;

        res.setHeader('accept-ranges', 'bytes');
        res.setHeader('content-type', contentType);

        if (range) {
          const suffixMatch = range.match(/^bytes=-(\d+)$/);
          if (suffixMatch) {
            const n = parseInt(suffixMatch[1], 10);
            if (n <= 0 || fileSize === 0) {
              res.writeHead(416);
              res.end();
              return;
            }
            const start = Math.max(fileSize - n, 0);
            const end = fileSize - 1;
            const chunkLen = end - start + 1;
            res.writeHead(206, {
              'content-range': `bytes ${start}-${end}/${fileSize}`,
              'content-length': String(chunkLen)
            });
            const stream = fs.createReadStream(realPath, { start, end });
            stream.on('error', (err) => {
              logger.warn('media-server', `stream error (suffix range) ${rawPath}: ${err.message}`);
              res.destroy();
            });
            stream.pipe(res);
            return;
          }
          const match = range.match(/bytes=(\d+)-(\d*)/);
          if (!match) {
            logger.warn('media-server', `invalid range header: ${range}`);
            res.writeHead(416);
            res.end();
            return;
          }
          const start = parseInt(match[1], 10);
          const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
          if (start > end || start >= fileSize) {
            res.writeHead(416);
            res.end();
            return;
          }
          const chunkLen = end - start + 1;

          res.writeHead(206, {
            'content-range': `bytes ${start}-${end}/${fileSize}`,
            'content-length': String(chunkLen)
          });

          const stream = fs.createReadStream(realPath, { start, end });
          stream.on('error', (err) => {
            logger.warn('media-server', `stream error (range) ${rawPath}: ${err.message}`);
            res.destroy();
          });
          stream.pipe(res);
        } else {
          res.writeHead(200, { 'content-length': String(fileSize) });
          const stream = fs.createReadStream(realPath);
          stream.on('error', (err) => {
            logger.warn('media-server', `stream error ${rawPath}: ${err.message}`);
            res.destroy();
          });
          stream.pipe(res);
        }
      } catch (e) {
        const err = e as { message?: string; code?: string };
        logger.error('media-server', `request failed: ${req.method} ${req.url}`, err.message ?? '');
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        } else {
          res.destroy();
        }
      }
    });

    server.on('error', (err) => {
      logger.error('media-server', 'server error', err.message);
      reject(err);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port, token, close: () => server.close() });
    });
  });
}
