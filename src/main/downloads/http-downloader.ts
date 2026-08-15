import fs from 'fs';
import http from 'http';
import https from 'https';
import { logger } from '../../shared/logger';

const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export interface HttpDownloadProgress {
  received: number;
  total: number | null;
}

export interface HttpDownloadOptions {
  url: string;
  destPath: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  onProgress?: (p: HttpDownloadProgress) => void;
}

function doDownload(opts: HttpDownloadOptions, redirectsLeft: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const isHttps = opts.url.startsWith('https:');
    const transport = isHttps ? https : http;
    let received = 0;
    let total: number | null = null;
    const partPath = `${opts.destPath}.part`;

    const cleanup = (): void => {
      try {
        fs.rmSync(partPath, { force: true });
      } catch {
        // ignore
      }
    };

    const req = transport.get(
      opts.url,
      { headers: { 'User-Agent': 'Onda/1.0', ...(opts.headers || {}) } },
      (res) => {
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
        if (status < 200 || status >= 300) {
          res.resume();
          cleanup();
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const contentLength = res.headers['content-length'];
        if (contentLength) total = parseInt(contentLength, 10) || null;
        const out = fs.createWriteStream(partPath);
        res.on('data', (c: Buffer) => {
          received += c.length;
          opts.onProgress?.({ received, total });
        });
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(partPath, opts.destPath);
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
      }
    );

    req.setTimeout(opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS, () => {
      cleanup();
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', (err) => {
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