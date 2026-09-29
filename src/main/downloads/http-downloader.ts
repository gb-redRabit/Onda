import fs from 'fs';
import http from 'http';
import https from 'https';
import { logger } from '../../shared/logger';
import {
  createPinnedLookup,
  privateNetworkAllowedForTarget,
  resolveNetworkTarget
} from '../ipc/network-target';

const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Upper bound for a single HTTP download.
 *
 * The stream is a user-configured media source, so the length is whatever the
 * server claims — and a source that never stops sending would fill the disk.
 * The cap is deliberately far above any plausible single file, so it only fires
 * on a broken or hostile response; `onTooLarge` lets the caller surface it.
 */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024 * 1024;

interface HttpDownloadProgress {
  received: number;
  total: number | null;
}

interface HttpDownloadOptions {
  url: string;
  destPath: string;
  headers?: Record<string, string>;
  allowPrivateNetwork?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Overrides MAX_DOWNLOAD_BYTES; the total including a resumed prefix. */
  maxBytes?: number;
  onProgress?: (p: HttpDownloadProgress) => void;
}

async function doDownload(
  opts: HttpDownloadOptions,
  redirectsLeft: number,
  trustedOrigin?: string
): Promise<void> {
  if (opts.signal?.aborted) throw new Error('Aborted');
  const origin = trustedOrigin ?? new URL(opts.url).origin;
  const allowPrivateNetwork = privateNetworkAllowedForTarget(
    opts.url,
    origin,
    opts.allowPrivateNetwork === true
  );
  const target = await resolveNetworkTarget(opts.url, { allowPrivateNetwork });

  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const maxBytes = opts.maxBytes ?? MAX_DOWNLOAD_BYTES;
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
      } catch (e) {
        // A stale .part file would make the next attempt resume from wrong bytes.
        logger.warn('download', `failed to remove partial file ${partPath}`, e);
      }
    };

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'Onda/1.0',
      ...(opts.headers || {})
    };
    if (startByte > 0) {
      requestHeaders['Range'] = `bytes=${startByte}-`;
    }

    /**
     * Set once the response body is being written, so an abort or a timeout can
     * tear down the write stream as well as the request. Leaving it open leaks a
     * file descriptor on every cancelled download.
     */
    let abortStreams: ((err: Error) => void) | null = null;
    const teardown = (err: Error): void => {
      cleanup();
      req.destroy();
      abortStreams?.(err);
      reject(err);
    };

    const req = transport.get(
      target.url,
      { headers: requestHeaders, lookup: createPinnedLookup(target.addresses) },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            cleanup();
            reject(new Error('Too many redirects'));
            return;
          }
          const next = new URL(res.headers.location, target.url).toString();
          const nextHeaders = new URL(next).origin === target.url.origin ? opts.headers : undefined;
          doDownload({ ...opts, url: next, headers: nextHeaders }, redirectsLeft - 1, origin).then(
            resolve,
            reject
          );
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
        // Reject an oversized body from the header before writing a byte, then
        // again while streaming for a response that sends no length at all.
        if (total !== null && total > maxBytes) {
          res.resume();
          cleanup();
          reject(new Error(`Download too large (${total} bytes > ${maxBytes})`));
          return;
        }

        const out = fs.createWriteStream(partPath, { flags: isResuming ? 'a' : 'w' });

        // Every failure goes through here: the response and the write stream are
        // separate file descriptors, and abandoning the write stream leaks one
        // per aborted download. `settled` keeps the first failure authoritative.
        let settled = false;
        const fail = (err: Error): void => {
          if (settled) return;
          settled = true;
          res.unpipe(out);
          out.destroy();
          res.destroy();
          cleanup();
          reject(err);
        };
        abortStreams = fail;

        res.on('data', (c: Buffer) => {
          received += c.length;
          if (received > maxBytes) {
            fail(new Error(`Download too large (over ${maxBytes} bytes)`));
            return;
          }
          opts.onProgress?.({ received, total });
        });
        res.pipe(out);
        out.on('finish', () => {
          if (settled) return;
          settled = true;
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
        out.on('error', fail);
        res.on('error', fail);
      }
    );

    const onAbortListener = (): void => teardown(new Error('Aborted'));
    opts.signal?.addEventListener('abort', onAbortListener, { once: true });

    req.setTimeout(opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS, () => teardown(new Error('Timeout')));
    req.on('error', (err) => {
      opts.signal?.removeEventListener('abort', onAbortListener);
      teardown(err);
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
