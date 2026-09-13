import { spawn } from 'child_process';
import { statSync } from 'fs';
import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger';
import type { IpcDownloadErrorCode } from '../../shared/types/ipc';
import {
  type Job,
  resolveOutputDir,
  outputExtensions,
  formatBytes,
  formatEta,
  deriveHttpFileName,
  parseYtDlpProgress
} from './download-helpers';
import { buildYtArgs, type YtAuthConfig } from '../ipc/youtube-utils';
import { resolveFinalOutputPath, findNewestOutput } from './output-path';
import { downloadHttpFile } from './http-downloader';
import { resolveSourceHeaders } from '../ipc/generic-fetch';
import { resolveScDownloadSource } from '../ipc/soundcloud-client';
import { classifyYtDlpError, describeError, redactSecrets } from './error-classifier';
import { addAllowedRoot } from '../media-server';
import { persist, reportCompleted, jobAbortControllers } from './download-state';

// A single download attempt (HTTP stream or yt-dlp process) for one job,
// extracted from `download-manager.ts` (plan 2.8).

const MAX_STDERR_BYTES = 64 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

// Direct-URL (source) download: streams the file with progress, then falls back
// to the shared postProcess (library sync, hash). No yt-dlp involved.
async function runHttpAttempt(
  job: Job,
  signal?: AbortSignal
): Promise<{ finishedOk: boolean; errorCode?: IpcDownloadErrorCode }> {
  const dir = resolveOutputDir(job);
  await mkdir(dir, { recursive: true });
  void addAllowedRoot(dir);
  const destPath = join(dir, job.source?.fileName || deriveHttpFileName(job));
  job.outputPath = destPath;
  persist(job);
  const headers = await resolveSourceHeaders(job.source?.apiKeyId, job.source?.headerName);
  const startedAt = Date.now();
  try {
    await downloadHttpFile({
      url: job.url,
      destPath,
      headers,
      signal,
      onProgress: (p) => {
        if (job.status !== 'downloading') return;
        if (p.total && p.total > 0) {
          job.progress = Math.min(100, Math.round((p.received / p.total) * 100));
        }
        const elapsed = (Date.now() - startedAt) / 1000;
        if (elapsed > 0.5) {
          const bps = p.received / elapsed;
          job.speed = `${formatBytes(bps)}/s`;
          if (p.total && p.total > 0) {
            job.eta = formatEta((p.total - p.received) / Math.max(bps, 1));
          }
        }
        persist(job);
      }
    });
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    persist(job);
    return { finishedOk: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If the job was paused/cancelled (via AbortController), don't overwrite
    // the status with 'error' — the caller already set it correctly.
    const alreadyStopped = job.status === 'paused' || job.status === 'cancelled';
    if (!alreadyStopped) {
      job.status = 'error';
      job.error = redactSecrets(msg);
      job.errorCode = classifyYtDlpError(msg);
    }
    persist(job);
    return { finishedOk: false, errorCode: job.errorCode };
  }
}

// Runs a single yt-dlp process for the job. Resolves with whether the download
// finished successfully and (on failure) the classified error code.
export async function runJobAttempt(
  job: Job,
  bin: string,
  auth: YtAuthConfig | null,
  base: string[]
): Promise<{ finishedOk: boolean; errorCode?: IpcDownloadErrorCode }> {
  if (job.source?.mode === 'http') {
    const ac = new AbortController();
    jobAbortControllers.set(job.id, ac);
    try {
      return await runHttpAttempt(job, ac.signal);
    } finally {
      jobAbortControllers.delete(job.id);
    }
  }
  if (job.source?.mode === 'soundcloud') {
    let resolved: string | null = null;
    try {
      // SoundCloud CDN links are signed and time-limited: resolve a FRESH
      // progressive-MP3 URL at the start of every attempt so retries never
      // replay an expired signature.
      resolved = await resolveScDownloadSource(job.url);
    } catch (e) {
      // No progressive transcoding (Go+ gated / HLS-only) — degrade this
      // attempt to the yt-dlp pipeline, which handles HLS via ffmpeg and
      // still produces a playable audio file.
      logger.warn(
        'downloads',
        `sc progressive unavailable for ${job.id}, falling back to yt-dlp`,
        String(e)
      );
      job.source = { ...job.source, mode: 'ytdlp' };
    }
    if (resolved) {
      job.url = resolved;
      const ac = new AbortController();
      jobAbortControllers.set(job.id, ac);
      try {
        return await runHttpAttempt(job, ac.signal);
      } finally {
        jobAbortControllers.delete(job.id);
      }
    }
    // fall through to the yt-dlp spawn path below
  }
  const args = buildYtArgs(base, auth);
  // On Windows yt-dlp prints "Destination:" lines to stdout in the console
  // codepage, which would mangle non-ASCII names when decoded as UTF-8. Force
  // UTF-8 output so the parsed paths match the real files on disk.
  const child = spawn(bin, args, {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  job.child = child;

  let stdoutBuf = '';
  let stderrBuf = '';
  let stderrText = '';
  const destinations: string[] = [];
  const handleLine = (line: string): void => {
    const parsed = parseYtDlpProgress(line);
    if (!parsed) return;
    if (parsed.destination) {
      destinations.push(parsed.destination);
      job.outputPath = parsed.destination;
    }
    if (parsed.progress != null) {
      job.progress = parsed.progress;
      if (parsed.speed) job.speed = parsed.speed;
      if (parsed.eta) job.eta = parsed.eta;
    }
    persist(job);
  };
  const processChunk = (chunk: Buffer, which: 'out' | 'err'): void => {
    const buffer = which === 'out' ? stdoutBuf : stderrBuf;
    const text = buffer + chunk.toString('utf-8');
    if (which === 'err') {
      stderrText = (stderrText + chunk.toString('utf-8')).slice(-MAX_STDERR_BYTES);
    }
    const lines = text.split(/\r?\n/);
    const last = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
    if (which === 'out') stdoutBuf = last;
    else stderrBuf = last;
  };
  child.stdout?.on('data', (d: Buffer) => processChunk(d, 'out'));
  child.stderr?.on('data', (d: Buffer) => processChunk(d, 'err'));
  child.on('error', (err) => {
    job.status = 'error';
    job.error = redactSecrets(err.message);
    job.errorCode = classifyYtDlpError(err.message);
    persist(job);
  });
  let finishedOk = false;
  await new Promise<void>((resolve) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      job.status = 'error';
      job.error = 'Download timed out';
      job.errorCode = 'network';
      persist(job);
      try {
        child.kill();
      } catch {
        resolve();
      }
    }, DOWNLOAD_TIMEOUT_MS);
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve();
        return;
      }
      if (job.status === 'cancelled' || job.status === 'paused') {
        resolve();
        return;
      }
      if (signal) {
        job.status = 'cancelled';
      } else if (code === 0) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();
        finishedOk = true;
        reportCompleted(job);
        await resolveRealOutputPath(job, destinations);
      } else {
        job.status = 'error';
        const errorCode = classifyYtDlpError(stderrText);
        const detail = redactSecrets(stderrText.trim());
        job.errorCode = errorCode;
        job.error = detail || describeError(errorCode) || `yt-dlp exited with code ${code}`;
        if (job.coverStatus === 'fetching') job.coverStatus = 'error';
      }
      resolve();
    });
  });
  return { finishedOk, errorCode: job.errorCode };
}

// "Destination:" lines parsed from yt-dlp stdout can be mangled for non-ASCII
// names (Windows console codepage), while the files on disk always carry the
// correct Unicode name. Resolve the real final path by verifying the parsed
// destinations against the filesystem; as a last resort pick the newest
// matching file in the output directory.
async function resolveRealOutputPath(job: Job, destinations: string[]): Promise<void> {
  const exists = (p: string): boolean => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  };
  let real = resolveFinalOutputPath(destinations, exists);
  if (!real) {
    try {
      const dir = resolveOutputDir(job);
      const entries = await readdir(dir, { withFileTypes: true });
      const name = findNewestOutput(
        entries.map((e) => {
          try {
            return { name: e.name, mtimeMs: statSync(join(dir, e.name)).mtimeMs };
          } catch {
            return { name: e.name, mtimeMs: 0 };
          }
        }),
        outputExtensions(job),
        job.startedAt
      );
      if (name) real = join(dir, name);
    } catch (e) {
      logger.warn('downloads', `locating output file failed for ${job.id}`, e);
    }
  }
  if (real && real !== job.outputPath) {
    job.outputPath = real;
    persist(job);
  }
}
