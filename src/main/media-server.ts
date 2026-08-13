import http from 'http';
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

let allowedRoots: string[] = [];

async function resolveReal(root: string): Promise<string> {
  try {
    return await fs.promises.realpath(root);
  } catch {
    return normalize(root);
  }
}

export async function setAllowedRoots(roots: string[]): Promise<void> {
  const resolved: string[] = [];
  for (const r of roots) {
    if (typeof r === 'string' && r) {
      resolved.push(await resolveReal(r));
    }
  }
  allowedRoots = resolved;
}

export async function addAllowedRoot(root: string): Promise<void> {
  if (typeof root !== 'string' || !root) return;
  const real = await resolveReal(root);
  if (!allowedRoots.includes(real)) {
    allowedRoots.push(real);
  }
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
  if (!origin || origin === 'null') return null;
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

        if (!allowedRoots.some((root) => isWithinRoot(realPath, root))) {
          logger.warn(
            'media-server',
            `rejected path outside allowed roots: ${realPath} (roots=${allowedRoots.length})`
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
            if (n <= 0) {
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
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
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
