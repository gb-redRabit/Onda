import { unlink, readFile, rename } from 'fs/promises';
import { basename, join } from 'path';
import https from 'https';
import { createWriteStream } from 'fs';
import type { WebContents } from 'electron';
import { getBinDir } from '../../binaries';
import { hashFile } from '../../utils/hash';
import { YTDLP_CHANNEL, type BinTool } from './dependency-utils';

export interface InstallResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  path?: string | null;
  managed?: boolean;
}

const activeControllers = new Map<string, AbortController>();

export function emitProgress(
  sender: WebContents,
  tool: string,
  stage: string,
  percent: number
): void {
  if (sender.isDestroyed()) return;
  sender.send('dep:progress', { tool, stage, percent });
}

export function newSignal(tool: BinTool): AbortSignal {
  activeControllers.get(tool)?.abort();
  const controller = new AbortController();
  activeControllers.set(tool, controller);
  return controller.signal;
}

export function clearSignal(tool: BinTool): void {
  activeControllers.delete(tool);
}

export function abortTool(tool: string): void {
  activeControllers.get(tool)?.abort();
}

const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export function downloadFile(
  url: string,
  dest: string,
  signal: AbortSignal,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  return downloadFileInternal(url, dest, signal, onProgress, 0);
}

function downloadFileInternal(
  url: string,
  dest: string,
  signal: AbortSignal,
  onProgress: ((received: number, total: number) => void) | undefined,
  redirectCount: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error('too many redirects'));
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('invalid URL'));
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error('only HTTPS downloads are allowed'));
      return;
    }

    const tempDest = `${dest}.part`;
    let settled = false;
    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      void unlink(tempDest).catch(() => {
        /* best-effort */
      });
      reject(err);
    };
    const onAbort = (): void => fail(new Error('cancelled'));

    const req = https.get(url, { headers: { 'User-Agent': 'Onda/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        downloadFileInternal(next, dest, signal, onProgress, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      if (total > MAX_DOWNLOAD_BYTES) {
        res.destroy();
        fail(new Error('download exceeds size limit'));
        return;
      }

      let received = 0;
      const file = createWriteStream(tempDest);
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) {
          res.destroy(new Error('download exceeds size limit'));
          return;
        }
        onProgress?.(received, total);
      });
      res.on('error', (err) => {
        file.destroy();
        fail(err);
      });
      res.pipe(file);
      file.on('finish', () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        file.close(async () => {
          try {
            await rename(tempDest, dest);
            settled = true;
            resolve();
          } catch (err) {
            settled = true;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      });
      file.on('error', (err) => fail(err));
    });

    const timeout = setTimeout(() => {
      req.destroy(new Error('download timed out'));
    }, DOWNLOAD_TIMEOUT_MS);

    signal.addEventListener('abort', onAbort, { once: true });
    req.on('error', (err) => fail(err));
  });
}

export async function fetchLatestYtdlpVersion(): Promise<string | null> {
  // Śledzi aktywny kanał (domyślnie nightly), aby wbudowane sprawdzanie aktualizacji
  // raportowało prawdziwe aktualizacje, a nie porównywało do nieaktualnych stabilnych wydań.
  const repo = YTDLP_CHANNEL === 'nightly' ? 'yt-dlp/yt-dlp-nightly-builds' : 'yt-dlp/yt-dlp';
  return new Promise((resolve) => {
    const req = https.get(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers: { 'User-Agent': 'Onda/1.0', Accept: 'application/vnd.github+json' } },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d.toString('utf-8')));
        res.on('end', () => {
          try {
            const json = JSON.parse(body) as { tag_name?: string };
            resolve(json.tag_name ? json.tag_name.replace(/^v/, '') : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Strumieniowe SHA-256 (współdzielone z detekcją duplikatów) — bez wczytywania
// całej binarki (setki MB) do pamięci.
async function sha256OfFile(filePath: string): Promise<string> {
  const hash = await hashFile(filePath);
  if (hash === null) throw new Error(`could not hash ${basename(filePath)}`);
  return hash;
}

// Weryfikuje pobrany plik względem wbudowanego pinu SHA-256 (używane przez zarządzane
// FFmpeg, którego wpis w binaries.json zawiera dokładny hash assetu). Fail-closed:
// rzuca wyjątek przy niezgodności, więc wywołujący nigdy nie zachowuje niezweryfikowanej binarki.
export async function verifyFileSha256(
  filePath: string,
  expectedSha256: string,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) throw new Error('cancelled');
  const actual = await sha256OfFile(filePath);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${basename(filePath)}`);
  }
}

// Weryfikacja sumy kontrolnej fail-closed: pobiera manifest SHA, znajduje wpis dla
// `assetName` i porównuje go z SHA-256 pliku `filePath`. Rzuca wyjątek przy każdym
// niepowodzeniu (błąd pobierania, brak wpisu lub niezgodność), więc wywołujący nigdy nie
// zachowuje niezweryfikowanej binarki.
export async function verifyDownloadedFile(
  filePath: string,
  shaUrl: string,
  assetName: string,
  signal: AbortSignal
): Promise<void> {
  const shaDest = join(getBinDir(), `onda-${Date.now()}.sha256`);
  try {
    await downloadFile(shaUrl, shaDest, signal);
    // Linie manifestu wyglądają jak `<hash>  <filename>` (a czasem `*filename`).
    const line = (await readFile(shaDest, 'utf-8'))
      .split(/\r?\n/)
      .find((l) => l.trim().endsWith(` ${assetName}`) || l.trim().endsWith(` *${assetName}`));
    const expected = line?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const actual = await sha256OfFile(filePath);
    if (!expected || expected !== actual) {
      throw new Error(`Checksum mismatch for ${assetName}`);
    }
  } finally {
    await unlink(shaDest).catch(() => {
      /* best-effort */
    });
  }
}
