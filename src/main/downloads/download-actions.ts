import { randomUUID } from 'crypto';
import { logger } from '../../shared/logger';
import type { IpcDownloadJobInput, IpcDownloadTask } from '../../shared/types/ipc';
import { type Job } from './download-helpers';
import { snapshotDownloadTask } from './download-snapshot';
import { normalizeCoverSpec } from './cover-spec';
import { resolveProvider } from '../../shared/provider';
import { isSafeAbsolutePath } from '../utils/validate';
import { loadPersistedJobs, queueFilePath } from './download-queue-store';
import {
  jobs,
  queueOrder,
  jobAbortControllers,
  collectPersistableJobs,
  markQueueDirty,
  persist
} from './download-state';
import { pump } from './download-runner';

// Queue mutations (add/cancel/pause/resume/move/list/import/export/clear) and
// queue restore, extracted from `download-manager.ts` (plan 2.8).

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
    const isHttpSource = input.source?.mode === 'http' || input.source?.mode === 'soundcloud';
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
              typeof input.source.apiKeyId === 'string'
                ? input.source.apiKeyId.slice(0, 200)
                : undefined,
            headerName:
              typeof input.source.headerName === 'string'
                ? input.source.headerName.slice(0, 100)
                : undefined
          }
        : input.source && input.source.mode === 'soundcloud'
          ? {
              mode: 'soundcloud' as const,
              fileName:
                typeof input.source.fileName === 'string' && input.source.fileName
                  ? input.source.fileName.slice(0, 200)
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
      subsFormat:
        input.subsFormat === 'vtt' || input.subsFormat === 'ass' ? input.subsFormat : 'srt',
      subsMode: input.subsMode === 'manual' || input.subsMode === 'auto' ? input.subsMode : 'best',
      subsFolder: !!input.subsFolder,
      subtitleStatus: 'none',
      audioQuality: input.audioQuality,
      audioLanguage: typeof input.audioLanguage === 'string' ? input.audioLanguage : undefined,
      videoContainer:
        input.videoContainer === 'mkv' || input.videoContainer === 'webm'
          ? input.videoContainer
          : 'mp4',
      sponsorBlock:
        input.sponsorBlock === 'mark' || input.sponsorBlock === 'remove'
          ? input.sponsorBlock
          : 'off',
      trimStart:
        typeof input.trimStart === 'number' && input.trimStart >= 0 ? input.trimStart : undefined,
      trimEnd: typeof input.trimEnd === 'number' && input.trimEnd > 0 ? input.trimEnd : undefined,
      addToLibrary: !!input.addToLibrary,
      source
    };
    jobs.set(job.id, job);
    if (job.status === 'pending') queueOrder.push(job.id);
    created.push(snapshotDownloadTask(job));
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
  return [...jobs.values()].map(snapshotDownloadTask);
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
    const isHttpSource = t.source?.mode === 'http' || t.source?.mode === 'soundcloud';
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
