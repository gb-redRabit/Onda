import { unlink, readFile } from 'fs/promises';
import { join } from 'path';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { createHash } from 'crypto';
import type { WebContents } from 'electron';
import { getBinDir } from '../binaries';
import type { BinTool } from './dependency-utils';

export interface InstallResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  path?: string | null;
  managed?: boolean;
}

const activeControllers = new Map<string, AbortController>();

export function emitProgress(sender: WebContents, tool: string, stage: string, percent: number): void {
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

export function downloadFile(
  url: string,
  dest: string,
  signal: AbortSignal,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const onAbort = () => reject(new Error('cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });

    const req = client.get(
      url,
      { headers: { 'User-Agent': 'Onda/1.0' } },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          downloadFile(res.headers.location, dest, signal, onProgress).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length'] || 0);
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          onProgress?.(received, total);
        });
        const file = createWriteStream(dest);
        file.on('finish', () => {
          signal.removeEventListener('abort', onAbort);
          file.close(() => resolve());
        });
        file.on('error', reject);
        res.pipe(file);
      }
    );
    req.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

export async function fetchLatestYtdlpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest',
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

async function sha256OfFile(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

// Fail-closed checksum verification: downloads a SHA manifest, finds the entry for
// `assetName`, and compares it against the SHA-256 of `filePath`. Throws on any
// failure (download error, missing entry, or mismatch) so the caller never keeps
// an unverified binary.
export async function verifyDownloadedFile(
  filePath: string,
  shaUrl: string,
  assetName: string,
  signal: AbortSignal
): Promise<void> {
  const shaDest = join(getBinDir(), `onda-${Date.now()}.sha256`);
  try {
    await downloadFile(shaUrl, shaDest, signal);
    // Manifest lines look like `<hash>  <filename>` (and sometimes `*filename`).
    const line = (await readFile(shaDest, 'utf-8'))
      .split(/\r?\n/)
      .find((l) => l.trim().endsWith(` ${assetName}`) || l.trim().endsWith(` *${assetName}`));
    const expected = line?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const actual = await sha256OfFile(filePath);
    if (!expected || expected !== actual) {
      throw new Error(`Checksum mismatch for ${assetName}`);
    }
  } finally {
    await unlink(shaDest).catch(() => {});
  }
}
