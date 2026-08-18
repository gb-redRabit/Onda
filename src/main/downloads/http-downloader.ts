import fs from 'fs';
import http from 'http';
import https from 'https';
import { logger } from '../../shared/logger';

const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

interface HttpDownloadProgress {
  received: number;
  total: number | null;
}

interface HttpDownloadOptions {
  url: string;
  destPath: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (p: HttpDownloadProgress) => void;
}

function doDownload(opts: HttpDownloadOptions, redirectsLeft: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const isHttps = opts.url.startsWith('https:');
    const transport = isHttps ? https : http;
    let received = 0;
    let total: number | null = null;
    const partPath = `${opts.destPath}.part`;

    // Resume support: check existing .part file and send Range header.
    let startByte = 0;
    try {
      const partStat = fs.statSync(partPath, { throwIfNoEntry: false });
      if (partStat && partStat.size > 0) {
        startByte = partStat.size;
        received = startByte;
      }
    } catch {
      // no partial file — start from scratch
    }

    const cleanup = (): void => {
      try {
        fs.rmSync(partPath, { force: true });
      } catch {
        // ignore
      }
    };

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Onda/1.0',
      ...(opts.headers || {})
    };
    if (startByte > 0) {
      requestHeaders['Range'] = `bytes=${startByte}-`;
    }

    const req = transport.get(opts.url, { headers: requestHeaders }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          cleanup();
          reject(new Error('Too many redirects'));
          return;
        }
        const next = new URL(res.headers.location, opts.url).toString();
        doDownload({ ...opts, url: next }, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      // 206 Partial Content — server supports resume
      // 200 OK — server doesn't support resume, restart from scratch
      const isResuming = status === 206;
      if (!isResuming && startByte > 0) {
        // Server doesn't support Range — reset offset
        startByte = 0;
        received = 0;
        cleanup();
      }
      if (status < 200 || (status >= 300 && status !== 206)) {
        res.resume();
        cleanup();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const contentLength = res.headers['content-length'];
      if (contentLength) {
        const len = parseInt(contentLength, 10) || 0;
        total = isResuming ? startByte + len : len;
      }
      const out = fs.createWriteStream(partPath, { flags: isResuming ? 'a' : 'w' });
      res.on('data', (c: Buffer) => {
        received += c.length;
        opts.onProgress?.({ received, total });
      });
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(partPath, opts.destPath);
          } catch {
            try {
              fs.copyFileSync(partPath, opts.destPath);
              fs.unlinkSync(partPath);
            } catch (copyErr) {
              cleanup();
              reject(copyErr as Error);
              return;
            }
          }
          opts.onProgress?.({ received, total });
          resolve();
        });
      });
      out.on('error', (err) => {
        cleanup();
        reject(err);
      });
      res.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });

    const onAbort = (): void => {
      cleanup();
      req.destroy();
      reject(new Error('Aborted'));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    req.setTimeout(opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS, () => {
      cleanup();
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbort);
      cleanup();
      reject(err);
    });
  });
}

/**
 * Pobiera URL bezpośrednio do pliku (z `.part` tymczasowo). Błędy rzucane są jako
 * Error z komunikatem klasyfikowalnym przez error-classifier (network/not-found/...).
 */
export async function downloadHttpFile(opts: HttpDownloadOptions): Promise<void> {
  try {
    await doDownload(opts, MAX_REDIRECTS);
  } catch (e) {
    logger.warn('http-download', `download failed for ${opts.url}`, e);
    throw e;
  }
}