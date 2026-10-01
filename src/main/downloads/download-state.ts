import type { IpcDownloadTask } from '../../shared/types/ipc';
import { snapshotDownloadTask } from './download-snapshot';
import { capPersistedJobs, persistJobs, queueFilePath } from './download-queue-store';
import type { Job } from './download-helpers';

// In-memory download queue state + persistence, extracted from
// `download-manager.ts` (plan 2.8). Other download modules share this state.

export const jobs = new Map<string, Job>();
export const queueOrder: string[] = [];

// Scheduled-start hold: while `until` is in the future, pump() does not start new
// jobs. Already-running downloads are unaffected.
export const hold = { until: 0 };

export const PERSISTABLE_STATUSES = new Set(['pending', 'paused', 'downloading', 'error']);

const knownStatuses = new Map<string, string>();
export const jobAbortControllers = new Map<string, AbortController>();

let emit: ((task: IpcDownloadTask) => void) | null = null;
let queuePersistTimer: ReturnType<typeof setTimeout> | null = null;

export function setDownloadEmit(cb: ((task: IpcDownloadTask) => void) | null): void {
  emit = cb;
}

export function collectPersistableJobs(): IpcDownloadTask[] {
  return capPersistedJobs(
    [...jobs.values()].map(snapshotDownloadTask).filter((j) => PERSISTABLE_STATUSES.has(j.status))
  );
}

export function markQueueDirty(): void {
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

/**
 * Publishes a job's progress/status to the renderer and the on-disk queue.
 *
 * The object in `jobs` is mutated IN PLACE rather than replaced. The running
 * download holds its own reference to the job (and sets `job.child` on it), so
 * swapping the map entry for a fresh copy left the runner writing to an object
 * the rest of the app could no longer see — `cancel`/`pause` then found no
 * child process, and the `finally` in runJob re-persisted the stale copy,
 * undoing the cancellation.
 */
export function persist(job: Job): void {
  const copy = snapshotDownloadTask(job);
  const prev = knownStatuses.get(job.id);
  const tracked = jobs.get(job.id);
  if (tracked) {
    // `child` is process state, not an IPC field, so the snapshot drops it.
    // Carry it over explicitly: assigning the caller's fields would otherwise
    // clear a child that only the tracked object knows about.
    const child = tracked.child ?? job.child;
    Object.assign(tracked, job, copy);
    tracked.child = child;
  } else {
    // Job was created outside the queue (e.g. a direct runner call); adopt it
    // under its own id so later lookups see the same object.
    jobs.set(job.id, Object.assign(job, copy));
  }
  // Persist to disk only on status transitions (progress ticks do not change
  // the status and must not thrash the queue store).
  if (prev !== copy.status) {
    knownStatuses.set(job.id, copy.status);
    markQueueDirty();
  }
  emit?.(copy);
}

/** Drops the status memo for a job, so the next persist re-triggers a write. */
export function forgetJob(id: string): void {
  knownStatuses.delete(id);
  jobAbortControllers.delete(id);
}

type DownloadCompletedHandler = (channelId: string, videoId: string) => void;
let onDownloadCompleted: DownloadCompletedHandler | null = null;

// Called when a finished download carries a media-source job (sourceId +
// sourceItemId). The sources layer records the item as downloaded so the
// Sources view can badge it on the next fetch.
type SourceItemDownloadedHandler = (sourceId: string, itemId: string) => void;
let onSourceItemDownloaded: SourceItemDownloadedHandler | null = null;

// Called whenever a job finishes successfully and carries a channel+video id.
// The subscriptions layer uses it to atomically grow downloadedVideoIds (so
// finished downloads are never lost, and are recorded even if renderer state
// was stale at completion time).
export function setDownloadCompletedHandler(cb: DownloadCompletedHandler | null): void {
  onDownloadCompleted = cb;
}

export function setSourceItemDownloadedHandler(cb: SourceItemDownloadedHandler | null): void {
  onSourceItemDownloaded = cb;
}

export function reportCompleted(job: Job): void {
  try {
    if (job.channelId && job.videoId) onDownloadCompleted?.(job.channelId, job.videoId);
  } catch {
    // Non-fatal: next check would re-queue the video.
  }
  try {
    const sourceId = job.source?.sourceId;
    const itemId = job.source?.sourceItemId;
    if (sourceId && itemId) onSourceItemDownloaded?.(sourceId, itemId);
  } catch {
    // Non-fatal: a later fetch still reads what was already persisted.
  }
}
