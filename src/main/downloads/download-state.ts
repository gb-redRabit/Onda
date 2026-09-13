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

export function persist(job: Job): void {
  const copy = snapshotDownloadTask(job);
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

type DownloadCompletedHandler = (channelId: string, videoId: string) => void;
let onDownloadCompleted: DownloadCompletedHandler | null = null;

// Called whenever a job finishes successfully and carries a channel+video id.
// The subscriptions layer uses it to atomically grow downloadedVideoIds (so
// finished downloads are never lost, and are recorded even if renderer state
// was stale at completion time).
export function setDownloadCompletedHandler(cb: DownloadCompletedHandler | null): void {
  onDownloadCompleted = cb;
}

export function reportCompleted(job: Job): void {
  if (!job.channelId || !job.videoId) return;
  try {
    onDownloadCompleted?.(job.channelId, job.videoId);
  } catch {
    // Non-fatal: next check would re-queue the video.
  }
}
