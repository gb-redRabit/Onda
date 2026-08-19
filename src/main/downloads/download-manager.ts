import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { statSync } from 'fs';
import { mkdir, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { app } from 'electron';
import { logger } from '../../shared/logger';
import type { IpcDownloadJobInput, IpcDownloadTask, IpcDownloadErrorCode } from '../../shared/types/ipc';
import { AUDIO_EXTS } from '../../shared/constants';
import { resolveBin } from '../binaries';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube-auth';
import { buildYtArgs, type YtAuthConfig } from '../ipc/youtube-utils';
import { resolveProvider } from '../../shared/provider';
import { getStore } from '../ipc/cover-cache';
import { normalizeCoverSpec, resolveFolderTokens, buildThumbnailArgs, buildSectionArgs } from './cover-spec';
import { processCover, applyMetadataOverride, removeThumbnailFiles } from './cover-processing';
import { syncDownloadToLibrary } from './library-sync';
import { addToChannelPlaylist } from './channel-playlist';
import { classifyYtDlpError, describeError, redactSecrets } from './error-classifier';
import { sha256File } from './hash-file';
import { buildSubtitleArgs } from './subtitle-args';
import { findSiblingSubtitleFiles, moveSubtitlesToFolder } from './subtitle-files';
import { buildSponsorBlockArgs } from './sponsorblock';
import { isWithinWindow } from './schedule';
import {
  loadPersistedJobs,
  persistJobs,
  capPersistedJobs,
  queueFilePath
} from './download-queue-store';
import { isSafeAbsolutePath } from '../utils/validate';
import { readProxyArgs, readSpeedLimitArgs } from '../ipc/proxy-utils';
import { addAllowedRoot } from '../media-server';
import { resolveFinalOutputPath, findNewestOutput } from './output-path';
import { downloadHttpFile } from './http-downloader';
import { resolveSourceHeaders } from '../ipc/generic-fetch';

const MAX_CONCURRENT = 10;
const MAX_STDERR_BYTES = 64 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 1500;

const AUDIO_QUALITY_MAP: Record<string, string> = {
  best: '0',
  high: '2',
  medium: '5',
  low: '9'
};

function mapFilenameTemplate(template: string): string {
  const tokens: Record<string, string> = {
    '{title}': '%(title)s',
    '{artist}': '%(artist,uploader,channel)s',
    '{album}': '%(album)s',
    '{year}': '%(release_year)s',
    '{id}': '%(id)s'
  };
  let out = template.replace(/\s*[\\/:*?"<>|]\s*/g, ' ');
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(key).join(value);
  }
  return out.trim() || '%(title)s';
}

function parseYtDlpProgress(
  line: string
): { progress?: number; speed?: string; eta?: string; destination?: string } | null {
  const dest = line.match(/\[(?:download|ExtractAudio|Merger)\] Destination: (.+)/);
  if (dest) return { destination: dest[1].trim() };
  const pct = line.match(/\[download\]\s+([\d.]+)%/);
  if (!pct) return null;
  const speed = line.match(/\bat\s+([\d.]+[A-Za-z]+\/s)\b/);
  const eta = line.match(/\bETA\s+(\S+)/);
  const progress = Math.min(100, Math.max(0, parseFloat(pct[1])));
  return {
    progress,
    ...(speed ? { speed: speed[1] } : {}),
    ...(eta ? { eta: eta[1] } : {})
  };
}

function buildFormatSelector(quality: string, kind: 'audio' | 'video'): string {
  if (kind === 'audio') return 'bestaudio/best';
  if (quality === 'best' || quality === 'bestaudio') return 'bestvideo+bestaudio/best';
  const height = quality.replace(/p$/, '');
  return `bestvideo[height<=${height}]+bestaudio/best`;
}

function resolveOutputDir(job: Job): string {
  return (
    resolveFolderTokens(job.outputDir.trim(), {
      channelTitle: job.channelTitle,
      playlistTitle: job.playlistTitle
    }) || app.getPath('downloads')
  );
}

// Candidate extensions of the final media file, used to locate the real output
// on disk when the destination parsed from yt-dlp stdout is unavailable.
function outputExtensions(job: Job): string[] {
  if (job.kind === 'video') return [`.${job.videoContainer || 'mp4'}`];
  if (job.format === 'best') return [...AUDIO_EXTS, '.webm'];
  return [`.${job.format || 'mp3'}`];
}

interface Job extends IpcDownloadTask {
  child?: ChildProcess;
}

function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB`;
  if (bytesPerSec >= 1024) return `${Math.round(bytesPerSec / 1024)} KB`;
  return `${Math.round(bytesPerSec)} B`;
}

function formatEta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/\s*[\\/:*?"<>|]\s*/g, ' ').trim().slice(0, 180) || 'download';
}

function deriveHttpFileName(job: Job): string {
  const base = sanitizeFileName(job.title || 'download');
  try {
    const ext = extname(new URL(job.url).pathname).toLowerCase();
    if (ext && ext.length <= 10) return `${base}${ext}`;
  } catch {
    // not a URL — fall through
  }
  return `${base}.bin`;
}

const jobs = new Map<string, Job>();
const queueOrder: string[] = [];
let running = 0;
let emit: ((task: IpcDownloadTask) => void) | null = null;

export function setDownloadEmit(cb: ((task: IpcDownloadTask) => void) | null): void {
  emit = cb;
}

// Debounced disk persistence of the queue. Status changes mark the store dirty;
// the actual write is coalesced so progress ticks never thrash the disk.
let queuePersistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSISTABLE_STATUSES = new Set(['pending', 'paused', 'downloading', 'error']);

function collectPersistableJobs(): IpcDownloadTask[] {
  return capPersistedJobs(
    [...jobs.values()].map(snapshot).filter((j) => PERSISTABLE_STATUSES.has(j.status))
  );
}

function markQueueDirty(): void {
  if (queuePersistTimer) return;
  queuePersistTimer = setTimeout(() => {
    queuePersistTimer = null;
    void persistJobs(queueFilePath(), collectPersistableJobs());
  }, 400);
}

// Immediately persists the queue to disk, cancelling any pending debounce.
// Called on app quit to avoid losing the last ~0.5s of status changes.
export function flushQueueNow(): void {
  if (queuePersistTimer) {
    clearTimeout(queuePersistTimer);
    queuePersistTimer = null;
  }
  void persistJobs(queueFilePath(), collectPersistableJobs());
}

// Restores the queue from disk after a restart. Interrupted downloads become
// paused (never completed) so the user can resume them via `--continue`; pending
// jobs are re-queued and pumped again.
export async function restoreDownloadQueue(): Promise<void> {
  const persisted = await loadPersistedJobs(queueFilePath());
  for (const task of persisted) {
    let status = task.status;
    if (status === 'completed' || status === 'cancelled') continue;
    if (status === 'downloading') status = 'paused';
    const job: Job = {
      ...task,
      status,
      progress: 0,
      speed: '',
      eta: '',
      completedAt: undefined,
      error: status === 'paused' ? undefined : task.error
    };
    jobs.set(job.id, job);
    if (job.status === 'pending') queueOrder.push(job.id);
  }
  if (persisted.length) logger.info('downloads', `restored ${persisted.length} queued jobs`);
  void pump();
}

type DownloadCompletedHandler = (channelId: string, videoId: string) => void;
let onDownloadCompleted: DownloadCompletedHandler | null = null;

// Called whenever a job finishes successfully and carries a channel+video id.
// The subscriptions layer uses it to atomically grow downloadedVideoIds (so
// finished downloads are never lost, and are recorded even if renderer state
// was stale at completion time).
export function setDownloadCompletedHandler(cb: DownloadCompletedHandler | null): void {
  onDownloadCompleted = cb;
}

function reportCompleted(job: Job): void {
  if (!job.channelId || !job.videoId) return;
  try {
    onDownloadCompleted?.(job.channelId, job.videoId);
  } catch {
    // Non-fatal: next check would re-queue the video.
  }
}

function snapshot(task: IpcDownloadTask): IpcDownloadTask {
  return {
    id: task.id,
    url: task.url,
    title: task.title,
    thumbnail: task.thumbnail,
    kind: task.kind,
    format: task.format,
    quality: task.quality,
    outputDir: task.outputDir,
    filenameTemplate: task.filenameTemplate,
    progress: task.progress,
    speed: task.speed,
    eta: task.eta,
    status: task.status,
    error: task.error,
    errorCode: task.errorCode,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    outputPath: task.outputPath,
    videoId: task.videoId,
    channelId: task.channelId,
    channelTitle: task.channelTitle,
    playlistTitle: task.playlistTitle,
    cover: task.cover,
    coverStatus: task.coverStatus,
    metaOverride: task.metaOverride,
    inLibrary: task.inLibrary,
    fileHash: task.fileHash,
    subsLangs: task.subsLangs,
    subsFormat: task.subsFormat,
    subsMode: task.subsMode,
    subsFolder: task.subsFolder,
    subtitleStatus: task.subtitleStatus,
    audioQuality: task.audioQuality,
    audioLanguage: task.audioLanguage,
    videoContainer: task.videoContainer,
    sponsorBlock: task.sponsorBlock,
    trimStart: task.trimStart,
    trimEnd: task.trimEnd,
    addToLibrary: task.addToLibrary,
    source: task.source
  };
}

const knownStatuses = new Map<string, string>();
const jobAbortControllers = new Map<string, AbortController>();

function persist(job: Job): void {
  const copy = snapshot(job);
  const prev = knownStatuses.get(job.id);
  jobs.set(job.id, { ...job, ...copy });
  // Persist to disk only on status transitions (progress ticks do not change
  // the status and must not thrash the queue store).
  if (prev !== copy.status) {
    knownStatuses.set(job.id, copy.status);
    markQueueDirty();
  }
  emit?.(copy);
}

async function readMaxConcurrent(): Promise<number> {
  try {
    const store = await getStore();
    const download = store.get('download') as { maxConcurrent?: number } | undefined;
    const value = download?.maxConcurrent;
    if (value && value > 0) return Math.min(value, MAX_CONCURRENT);
    return 3;
  } catch {
    return 3;
  }
}

async function readHashFilesEnabled(): Promise<boolean> {
  try {
    const store = await getStore();
    const download = store.get('download') as { hashFiles?: boolean } | undefined;
    return !!download?.hashFiles;
  } catch {
    return false;
  }
}

interface NightSchedule {
  enabled: boolean;
  start: number;
  end: number;
}

async function readNightSchedule(): Promise<NightSchedule> {
  try {
    const store = await getStore();
    const download = store.get('download') as {
      nightScheduleEnabled?: boolean;
      nightScheduleStart?: number;
      nightScheduleEnd?: number;
    } | undefined;
    return {
      enabled: !!download?.nightScheduleEnabled,
      start: download?.nightScheduleStart ?? 22,
      end: download?.nightScheduleEnd ?? 6
    };
  } catch {
    return { enabled: false, start: 22, end: 6 };
  }
}

// Scheduled start: while `holdUntil` is in the future, pump() does not start new
// jobs. Already-running downloads are unaffected.
let holdUntil = 0;
let holdTimer: ReturnType<typeof setTimeout> | null = null;

function clearHoldTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

export function scheduleDownloadStart(timestamp: number | null): boolean {
  clearHoldTimer();
  if (timestamp == null) {
    holdUntil = 0;
    void pump();
    return true;
  }
  const delay = timestamp - Date.now();
  if (delay <= 0) {
    holdUntil = 0;
    void pump();
    return true;
  }
  holdUntil = timestamp;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    holdUntil = 0;
    void pump();
  }, delay);
  return true;
}

export function getScheduledStart(): number | null {
  return holdUntil || null;
}

async function pump(): Promise<void> {
  if (holdUntil && Date.now() < holdUntil) return;
  const night = await readNightSchedule();
  if (night.enabled && !isWithinWindow(new Date().getHours(), night.start, night.end)) {
    return;
  }
  const max = await readMaxConcurrent();
  while (running < max && queueOrder.length > 0) {
    const id = queueOrder.shift();
    if (!id) break;
    const job = jobs.get(id);
    if (!job || job.status !== 'pending') continue;
    void runJob(job);
  }
}

async function runJob(job: Job): Promise<void> {
  running++;
  job.status = 'downloading';
  job.progress = 0;
  persist(job);
  let auth: YtAuthConfig | null = null;
  try {
    const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
    // May be null when auth is disabled ("none") or no valid session exists —
    // public videos can still be downloaded without cookies, and yt-dlp reports
    // a specific error for age-restricted / private / members-only content.
    auth = await getYtAuthConfig();
    const base = await buildBaseArgs(job);
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const result = await runJobAttempt(job, bin, auth, base);
      if (result.finishedOk) {
        await postProcess(job);
        return;
      }
      const retryable = result.errorCode === 'network' || result.errorCode === 'bot-block';
      const status = job.status as IpcDownloadTask['status'];
      const stopped = status === 'cancelled' || status === 'paused';
      if (!retryable || stopped || attempt >= MAX_RETRY_ATTEMPTS) return;
      // Reset transient state and retry after an exponential backoff. Privacy,
      // access-rights and not-found errors are never retried.
      job.status = 'downloading';
      job.progress = 0;
      job.speed = '';
      job.eta = '';
      job.error = undefined;
      job.errorCode = undefined;
      if (job.coverStatus === 'error') job.coverStatus = 'none';
      persist(job);
      logger.info('downloads', `retrying ${job.id} (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
      // Re-check status after the backoff — the user may have paused/cancelled
      // during the sleep (job.child is undefined so pause/cancel can't kill it).
      const postSleep = job.status as IpcDownloadTask['status'];
      if (postSleep === 'cancelled' || postSleep === 'paused') return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('downloads', `job failed: ${msg}`);
    job.status = 'error';
    job.error = redactSecrets(msg);
    job.errorCode = classifyYtDlpError(msg);
  } finally {
    running--;
    job.child = undefined;
    persist(job);
    await cleanupYtAuthTemp(auth);
    void pump();
  }
}

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

// Builds the yt-dlp argument list (without bin/auth) for a job: output dir and
// template, format selector, subtitles, proxy and speed limit. May mutate
// job.cover (native audio drops thumbnail embedding) and job.coverStatus.
async function buildBaseArgs(job: Job): Promise<string[]> {
  const dir = resolveOutputDir(job);
  await mkdir(dir, { recursive: true });
  // The media server only knows library folders + explicitly opened files.
  // A download into any other folder (e.g. default Downloads) would get 403 on
  // cover/playback requests, so grant access to the output dir up front — the
  // audio file and its animated-cover sibling land here.
  void addAllowedRoot(dir);
  const outputTemplate = join(dir, `${mapFilenameTemplate(job.filenameTemplate)}.%(ext)s`);
  // Guard against option injection: a URL starting with "-" would be parsed
  // as a yt-dlp flag.  Prepend "--" to end the options list, then validate.
  if (!job.url.startsWith('https://') && !job.url.startsWith('http://')) {
    throw new Error(`Invalid download URL: rejected non-http(s) scheme`);
  }
  const base: string[] = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--continue',
    '-o',
    outputTemplate
  ];
  if (job.kind === 'audio') {
    if (job.format === 'best') {
      // Native: keep the best available audio stream without re-encoding.
      base.push('-f', buildFormatSelector(job.quality, 'audio'));
      // Thumbnail embedding requires a container conversion; skip it for
      // native audio (frame/clip covers are still processed afterwards).
      if (job.cover?.type === 'thumbnail') job.cover = undefined;
    } else {
      base.push(
        '--extract-audio',
        '--audio-format',
        job.format,
        '--audio-quality',
        AUDIO_QUALITY_MAP[job.audioQuality || 'best'] || '0',
        '--embed-metadata',
        '--embed-chapters'
      );
      if (job.cover?.type === 'thumbnail') {
        base.push(...buildThumbnailArgs());
        job.coverStatus = 'fetching';
      }
    }
  } else {
    base.push(
      '-f',
      buildFormatSelector(job.quality, 'video'),
      '--merge-output-format',
      job.videoContainer || 'mp4',
      '--embed-metadata',
      '--embed-chapters'
    );
    if (job.cover?.type === 'thumbnail') {
      if (job.videoContainer === 'webm') {
        // WebM has no attached cover-art support — drop the thumbnail request.
        job.cover = undefined;
      } else {
        base.push(...buildThumbnailArgs());
        job.coverStatus = 'fetching';
      }
    }
  }
  if (job.audioLanguage) {
    base.push('--audio-language', job.audioLanguage);
  }
  base.push(...buildSponsorBlockArgs(job.sponsorBlock));
  if (job.source?.headers) {
    for (const [name, value] of Object.entries(job.source.headers)) {
      if (!name || !value) continue;
      base.push('--add-header', `${name}: ${value}`);
    }
  }
  if (
    typeof job.trimStart === 'number' &&
    typeof job.trimEnd === 'number' &&
    job.trimEnd > job.trimStart
  ) {
    base.push(...buildSectionArgs(job.trimStart, job.trimEnd));
  }
  if (job.subsLangs) {
    logger.info('downloads', `subtitle download enabled for ${job.id} (langs=${job.subsLangs})`);
    base.push(
      ...buildSubtitleArgs({
        langs: job.subsLangs,
        format: job.subsFormat,
        mode: job.subsMode,
        kind: job.kind,
        embed: job.kind === 'video'
      })
    );
  }
  base.push(...(await readProxyArgs()));
  base.push(...(await readSpeedLimitArgs()));
  base.push('--', job.url);
  return base;
}

// Runs a single yt-dlp process for the job. Resolves with whether the download
// finished successfully and (on failure) the classified error code.
async function runJobAttempt(
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

// Post-download pipeline (Faza 5/6): metadata override, cover processing and
// library refresh. Failures are non-fatal — the file itself is already done.
async function postProcess(job: Job): Promise<void> {
  const outputPath = job.outputPath || '';
  if (outputPath && job.metaOverride) {
    try {
      await applyMetadataOverride(outputPath, job.metaOverride);
    } catch (e) {
      logger.warn('downloads', `metadata override failed for ${job.id}`, e);
    }
  }
  if (
    outputPath &&
    job.kind === 'audio' &&
    job.cover &&
    job.cover.type !== 'thumbnail' &&
    job.cover.type !== 'none'
  ) {
    job.coverStatus = 'fetching';
    persist(job);
    const res = await processCover({
      taskId: job.id,
      url: job.url,
      cover: job.cover,
      outputPath
    });
    job.coverStatus = res.status;
    persist(job);
  } else if (job.cover?.type === 'thumbnail') {
    job.coverStatus = 'embedded';
    // The thumbnail is already embedded in the tags — drop the leftover image
    // yt-dlp wrote next to the audio file.
    if (outputPath) await removeThumbnailFiles(outputPath);
  }
  if (outputPath) {
    const sync = await syncDownloadToLibrary(outputPath, { forceAdd: !!job.addToLibrary });
    if (sync.inLibrary) {
      job.inLibrary = true;
      persist(job);
      if (job.channelTitle && sync.file) {
        await addToChannelPlaylist(job.channelTitle, sync.file);
      }
    }
    // SHA-256 checksum is opt-in (Settings → Pobieranie → hashFiles). It runs
    // after the file is final so the hash reflects the completed media.
    if (await readHashFilesEnabled()) {
      try {
        job.fileHash = await sha256File(outputPath);
        persist(job);
      } catch (e) {
        logger.warn('downloads', `hash failed for ${job.id}`, e);
      }
    }
    // Surface subtitle outcome instead of silently swallowing it via
    // `--ignore-errors`. Video subtitles are muxed into the container; audio
    // subtitles are sidecar files, optionally moved into a Subtitles/ folder.
    if (job.subsLangs) {
      if (job.kind === 'video') {
        job.subtitleStatus = 'embedded';
      } else {
        const files = await findSiblingSubtitleFiles(outputPath);
        if (files.length) {
          if (job.subsFolder) await moveSubtitlesToFolder(outputPath);
          job.subtitleStatus = 'saved';
        } else {
          job.subtitleStatus = 'missing';
        }
      }
      persist(job);
    }
  }
}

export async function addDownloadJobs(inputs: IpcDownloadJobInput[]): Promise<IpcDownloadTask[]> {
  const created: IpcDownloadTask[] = [];
  let replaced = 0;
  // Dedup by video ID against already-queued/finished jobs so the same video is
  // not enqueued twice in one session. Failed/cancelled jobs do NOT block a new
  // attempt — they are replaced below so a retry yields a single fresh job
  // instead of piling up duplicates (which also made later retries silently
  // skip while the duplicate was active).
  const knownVideoIds = new Set<string>();
  for (const j of jobs.values()) {
    if (j.videoId && j.status !== 'error' && j.status !== 'cancelled') {
      knownVideoIds.add(j.videoId);
    }
  }
  for (const input of inputs) {
    if (!input || !input.url) continue;
    const isHttpSource = input.source?.mode === 'http';
    // Źródła generyczne (mega/cda/vk/drive) jawnie żądają yt-dlp — pomijamy
    // gate providera przeznaczony dla klasycznej ścieżki YouTube.
    const isExplicitYtdlp = input.source?.mode === 'ytdlp';
    if (!isHttpSource && !isExplicitYtdlp && !resolveProvider(input.url)) continue;
    if (input.videoId && knownVideoIds.has(input.videoId)) continue;
    if (input.videoId) {
      // A re-queue is a retry of the previous attempt: drop every failed or
      // cancelled job for the same video so the queue holds one job per video.
      for (const [id, j] of [...jobs.entries()]) {
        if (j.videoId !== input.videoId) continue;
        if (j.status !== 'error' && j.status !== 'cancelled') continue;
        const qIdx = queueOrder.indexOf(id);
        if (qIdx >= 0) queueOrder.splice(qIdx, 1);
        jobs.delete(id);
        replaced++;
      }
      knownVideoIds.add(input.videoId);
    }
    const source =
      input.source && input.source.mode === 'http'
        ? {
            mode: 'http' as const,
            fileName:
              typeof input.source.fileName === 'string' && input.source.fileName
                ? input.source.fileName.slice(0, 200)
                : undefined,
            apiKeyId:
              typeof input.source.apiKeyId === 'string' ? input.source.apiKeyId.slice(0, 200) : undefined,
            headerName:
              typeof input.source.headerName === 'string'
                ? input.source.headerName.slice(0, 100)
                : undefined
          }
        : input.source && input.source.mode === 'ytdlp'
          ? {
              mode: 'ytdlp' as const,
              apiKeyId:
                typeof input.source.apiKeyId === 'string'
                  ? input.source.apiKeyId.slice(0, 200)
                  : undefined,
              headerName:
                typeof input.source.headerName === 'string'
                  ? input.source.headerName.slice(0, 100)
                  : undefined,
              headers:
                input.source.headers && typeof input.source.headers === 'object'
                  ? Object.fromEntries(
                      Object.entries(input.source.headers).filter(
                        ([k, v]) => typeof k === 'string' && typeof v === 'string'
                      )
                    )
                  : undefined
            }
          : undefined;
    const cover = normalizeCoverSpec(input.cover);
    // Direct-URL downloads have no yt-dlp thumbnail step — drop thumbnail covers.
    const finalCover = source && cover?.type === 'thumbnail' ? undefined : cover;
    const now = Date.now();
    const job: Job = {
      id: randomUUID(),
      url: input.url,
      title: input.title || input.url,
      thumbnail: input.thumbnail,
      kind: input.kind === 'video' ? 'video' : 'audio',
      format: input.format || 'mp3',
      quality: input.quality || 'best',
      outputDir:
        typeof input.outputDir === 'string' && isSafeAbsolutePath(input.outputDir)
          ? input.outputDir
          : '',
      filenameTemplate: input.filenameTemplate || '{title} - {artist}',
      progress: 0,
      speed: '',
      eta: '',
      status: 'pending',
      startedAt: now,
      videoId: input.videoId,
      channelId: input.channelId,
      channelTitle: input.channelTitle,
      playlistTitle: input.playlistTitle,
      cover: finalCover,
      coverStatus: 'none',
      metaOverride: input.metaOverride,
      subsLangs: input.subsLangs,
      subsFormat: input.subsFormat === 'vtt' || input.subsFormat === 'ass' ? input.subsFormat : 'srt',
      subsMode: input.subsMode === 'manual' || input.subsMode === 'auto' ? input.subsMode : 'best',
      subsFolder: !!input.subsFolder,
      subtitleStatus: 'none',
      audioQuality: input.audioQuality,
      audioLanguage: typeof input.audioLanguage === 'string' ? input.audioLanguage : undefined,
      videoContainer: input.videoContainer === 'mkv' || input.videoContainer === 'webm'
        ? input.videoContainer
        : 'mp4',
      sponsorBlock:
        input.sponsorBlock === 'mark' || input.sponsorBlock === 'remove'
          ? input.sponsorBlock
          : 'off',
      trimStart: typeof input.trimStart === 'number' && input.trimStart >= 0 ? input.trimStart : undefined,
      trimEnd: typeof input.trimEnd === 'number' && input.trimEnd > 0 ? input.trimEnd : undefined,
      addToLibrary: !!input.addToLibrary,
      source
    };
    jobs.set(job.id, job);
    if (job.status === 'pending') queueOrder.push(job.id);
    created.push(snapshot(job));
  }
  if (created.length || replaced) markQueueDirty();
  void pump();
  return created;
}

export function cancelDownloadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'pending') {
    queueOrder.splice(queueOrder.indexOf(id), 1);
    job.status = 'cancelled';
    persist(job);
    return true;
  }
  if (job.status === 'paused') {
    job.status = 'cancelled';
    persist(job);
    return true;
  }
  if (job.status === 'downloading' && job.child) {
    job.status = 'cancelled';
    persist(job);
    job.child.kill();
    return true;
  }
  // HTTP-mode jobs have no child process — abort via AbortController.
  if (job.status === 'downloading' && !job.child) {
    const ac = jobAbortControllers.get(id);
    if (ac) {
      job.status = 'cancelled';
      persist(job);
      ac.abort();
      return true;
    }
  }
  return false;
}

export function pauseDownloadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'pending') {
    queueOrder.splice(queueOrder.indexOf(id), 1);
    job.status = 'paused';
    persist(job);
    return true;
  }
  if (job.status === 'downloading' && job.child) {
    job.status = 'paused';
    persist(job);
    try {
      job.child.kill();
    } catch {
      /* already gone */
    }
    return true;
  }
  // HTTP-mode jobs — abort the stream via AbortController.
  if (job.status === 'downloading' && !job.child) {
    const ac = jobAbortControllers.get(id);
    if (ac) {
      job.status = 'paused';
      persist(job);
      ac.abort();
      return true;
    }
  }
  return false;
}

export function resumeDownloadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'paused') return false;
  job.status = 'pending';
  job.error = undefined;
  persist(job);
  queueOrder.push(id);
  void pump();
  return true;
}

// Pauses the whole queue: pending jobs leave the queue, active downloads are
// killed (their `.part` files are resumed later via `--continue`).
export function pauseAllDownloads(): boolean {
  let changed = false;
  queueOrder.length = 0;
  for (const job of jobs.values()) {
    if (job.status === 'pending') {
      job.status = 'paused';
      persist(job);
      changed = true;
    } else if (job.status === 'downloading') {
      job.status = 'paused';
      persist(job);
      try {
        job.child?.kill();
      } catch {
        /* already gone */
      }
      changed = true;
    }
  }
  return changed;
}

// Resumes every paused job and pumps the queue again.
export function resumeAllDownloads(): boolean {
  let changed = false;
  for (const job of jobs.values()) {
    if (job.status === 'paused') {
      job.status = 'pending';
      job.error = undefined;
      persist(job);
      queueOrder.push(job.id);
      changed = true;
    }
  }
  if (changed) void pump();
  return changed;
}

// Moves a pending job to the front of the queue ("download now").
export function moveDownloadToFront(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'pending') return false;
  const idx = queueOrder.indexOf(id);
  if (idx >= 0) queueOrder.splice(idx, 1);
  queueOrder.unshift(id);
  markQueueDirty();
  void pump();
  return true;
}

// Swaps a pending job with its neighbour in the queue (direction -1 = up, 1 = down).
export function moveDownload(id: string, direction: -1 | 1): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== 'pending') return false;
  const idx = queueOrder.indexOf(id);
  if (idx < 0) return false;
  const target = idx + direction;
  if (target < 0 || target >= queueOrder.length) return false;
  [queueOrder[idx], queueOrder[target]] = [queueOrder[target], queueOrder[idx]];
  markQueueDirty();
  return true;
}

export function listDownloadJobs(): IpcDownloadTask[] {
  return [...jobs.values()].map(snapshot);
}

// Snapshots the persistable jobs (pending/paused/downloading/error) for export.
export function exportQueue(): IpcDownloadTask[] {
  return collectPersistableJobs();
}

// Re-enqueues a list of previously persisted tasks (import). Tasks in a terminal
// state are dropped; active ones are re-added as pending work.
export async function importQueue(tasks: IpcDownloadTask[]): Promise<number> {
  const inputs: IpcDownloadJobInput[] = [];
  for (const t of tasks) {
    if (!t || typeof t.url !== 'string') continue;
    const isHttpSource = t.source?.mode === 'http';
    const isExplicitYtdlp = t.source?.mode === 'ytdlp';
    if (!isHttpSource && !isExplicitYtdlp && !resolveProvider(t.url)) continue;
    if (t.status === 'completed' || t.status === 'cancelled') continue;
    inputs.push({
      url: t.url,
      title: t.title,
      thumbnail: t.thumbnail,
      kind: t.kind,
      format: t.format,
      quality: t.quality,
      outputDir: t.outputDir,
      filenameTemplate: t.filenameTemplate,
      videoId: t.videoId,
      channelId: t.channelId,
      channelTitle: t.channelTitle,
      playlistTitle: t.playlistTitle,
      cover: t.cover,
      metaOverride: t.metaOverride,
      subsLangs: t.subsLangs,
      subsFormat: t.subsFormat,
      subsMode: t.subsMode,
      subsFolder: t.subsFolder,
      audioQuality: t.audioQuality,
      audioLanguage: t.audioLanguage,
      videoContainer: t.videoContainer,
      sponsorBlock: t.sponsorBlock,
      trimStart: t.trimStart,
      trimEnd: t.trimEnd,
      source: t.source
    });
  }
  const created = await addDownloadJobs(inputs);
  return created.length;
}

export function clearFinishedDownloads(): boolean {
  let removed = false;
  for (const [id, job] of [...jobs.entries()]) {
    if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
      jobs.delete(id);
      removed = true;
    }
  }
  if (removed) {
    logger.info('downloads', 'cleared finished jobs');
    markQueueDirty();
  }
  return removed;
}
