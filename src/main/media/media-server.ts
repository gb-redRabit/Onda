import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { normalize, isAbsolute, dirname, basename, join } from 'path';
import { logger } from '../../shared/logger';
import { getMimeType } from '../../shared/mime';
import {
  isWithinRoot,
  timingSafeEqualString,
  allowedOrigin,
  isAllowedStreamHost,
  validateStreamUrl
} from './media-server-guards';
import { handleStreamProxy } from './media-server-stream';
import { isServableMediaPath } from './media-paths';
import { isProtectedPath } from '../path-policy';
export { isAllowedStreamHost, validateStreamUrl };

export interface MediaServer {
  port: number;
  token: string;
  close: () => void;
}

// Korzenie biblioteki są wymieniane w całości przy każdej zmianie biblioteki;
// przyznane korzenie (jawnie otwarte pliki/foldery lub katalogi wyjściowe pobrań)
// akumulują się i muszą przetrwać restarty, więc są śledzone osobno i zapisywane.
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

// Hook wywoływany przy każdej zmianie zbioru dozwolonych korzeni, aby wywołujący
// mógł zapisać przyznane korzenie między restartami.
export function setRootsChangedHandler(cb: (() => void) | null): void {
  rootsChanged = cb;
}

// Przyznane (dodatkowe) korzenie — zapisywane przez aplikację, aby pobrania
// pozostały odtwarzalne po restarcie.
export function getExtraRoots(): string[] {
  return [...extraRoots];
}

export async function setAllowedRoots(roots: string[]): Promise<void> {
  libraryRoots.length = 0;
  libraryRoots.push(...(await resolveAll(roots)));
  rootsChanged?.();
}

/**
 * Sufit na korzenie ad-hoc, aby skompromitowany renderer nie mógł rosnąć listy
 * bez ograniczeń, wywołując `media:grantAccess` w pętli. Trafiają tu tylko ścieżki,
 * które aplikacja przyznaje sama — foldery biblioteki przez `setAllowedRoots`,
 * pobrania, bieżący plik odtwarzacza — więc legalna instalacja potrzebuje małego
 * ułamka tego.
 */
const MAX_EXTRA_ROOTS = 200;

/** False po osiągnięciu sufitu lub przy próbie dodania chronionej ścieżki. */
export async function addAllowedRoot(root: string): Promise<boolean> {
  if (typeof root !== 'string' || !root) return false;
  const real = await resolveReal(root);
  if (isProtectedPath(real)) {
    logger.warn('media', `refusing protected root: ${real}`);
    return false;
  }
  if (extraRoots.includes(real)) return true;
  if (extraRoots.length >= MAX_EXTRA_ROOTS) {
    logger.warn('media', `refusing extra root ${real}: limit of ${MAX_EXTRA_ROOTS} reached`);
    return false;
  }
  extraRoots.push(real);
  rootsChanged?.();
  return true;
}

function isWithinAnyRoot(filePath: string): boolean {
  for (const root of [...libraryRoots, ...extraRoots]) {
    if (isWithinRoot(filePath, root)) return true;
  }
  return false;
}

/**
 * Synchroniczny test, czy ZKANONIZOWANA (realpath) ścieżka leży w którymś z
 * dozwolonych korzeni. Używany m.in. przez handler `onda://` i `media:*Thumbnail`,
 * aby ograniczyć dostęp do plików spoza biblioteki/jawnie przyznanych katalogów.
 */
export function isPathWithinAllowedRoots(realPath: string): boolean {
  return isWithinAnyRoot(realPath);
}

// Kanonizuje cel `?path=` i egzekwuje whitelistę dozwolonych korzeni.
// Współdzielone przez GET i HEAD, aby żadna metoda nie mogła odczytać (ani
// ujawnić metadanych o) plikach poza przyznanymi korzeniami.
type MediaPathResolution =
  { ok: true; path: string } | { ok: false; reason: 'invalid' | 'forbidden' };

async function resolveAllowedMediaPath(rawPath: string): Promise<MediaPathResolution> {
  const normalized = normalize(rawPath);
  if (!isAbsolute(normalized)) return { ok: false, reason: 'invalid' };

  let realPath = normalized;
  try {
    realPath = await fs.promises.realpath(normalized);
  } catch {
    // realpath zawodzi dla brakującego (lub nieczytelnego) pliku. Zamiast tego
    // skanonizuj katalog nadrzędny i ponownie dołącz nazwę bazową, aby krótka nazwa
    // 8.3 (Windows CI: RUNNER~1) lub symlink /var -> /private/var rozwiązały się
    // wewnątrz zrealpathowanych dozwolonych korzeni. Poniższe sprawdzenie korzenia
    // nadal dotyczy odbudowanej ścieżki, więc ścieżki faktycznie poza każdym korzeniem
    // pozostają 403.
    try {
      realPath = join(await fs.promises.realpath(dirname(normalized)), basename(normalized));
    } catch {
      // przejdź do znormalizowanej ścieżki; poniższe sprawdzenie korzenia nadal obowiązuje
    }
  }

  // Tylko rozszerzenia mediów/obrazów. Nawet gdy przejęty renderer przyzna
  // korzeń zawierający klucze/konfiguracje, serwer nie odda tych plików —
  // domyka eksfiltrację niebędących mediami plików przez znany token.
  if (!isServableMediaPath(realPath)) return { ok: false, reason: 'forbidden' };

  return isWithinAnyRoot(realPath)
    ? { ok: true, path: realPath }
    : { ok: false, reason: 'forbidden' };
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

        // Proxy zdalnego strumienia: /{token}/stream?url=<https stream url>
        if (url.pathname.replace(/^\/+/, '').split('/')[1] === 'stream') {
          await handleStreamProxy(req, res, url.searchParams.get('url') || '');
          return;
        }

        // Szybka ścieżka HEAD: zwraca nagłówki bez czytania pliku. MUSI przejść to
        // samo sprawdzenie korzenia co GET — inaczej metadane (istnienie, rozmiar, typ)
        // dowolnego lokalnego pliku były czytelne samym tokenem.
        if (req.method === 'HEAD') {
          const resolved = await resolveAllowedMediaPath(url.searchParams.get('path') || '');
          if (!resolved.ok) {
            res.writeHead(resolved.reason === 'invalid' ? 400 : 403);
            res.end(resolved.reason === 'invalid' ? 'invalid path' : 'forbidden');
            return;
          }
          try {
            const stat = await fs.promises.stat(resolved.path);
            res.writeHead(200, {
              'content-type': getMimeType(resolved.path),
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

        const resolved = await resolveAllowedMediaPath(rawPath);
        if (!resolved.ok) {
          if (resolved.reason === 'invalid') {
            logger.warn('media-server', `rejected non-absolute path: ${rawPath}`);
            res.writeHead(400);
            res.end('invalid path');
            return;
          }
          logger.warn(
            'media-server',
            `rejected path outside allowed roots: ${rawPath} (roots=${libraryRoots.length + extraRoots.length})`
          );
          res.writeHead(403);
          res.end('forbidden');
          return;
        }
        const realPath = resolved.path;

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
