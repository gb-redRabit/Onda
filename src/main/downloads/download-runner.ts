import { logger } from '../../shared/logger';
import type { IpcDownloadTask } from '../../shared/types/ipc';
import { type Job } from './download-helpers';
import { resolveBin } from '../binaries';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube-auth';
import type { YtAuthConfig } from '../ipc/youtube-utils';
import { buildBaseArgs } from './download-args';
import { runJobAttempt } from './download-attempt';
import { postProcess } from './download-post-process';
import { classifyYtDlpError, redactSecrets } from './error-classifier';
import { isWithinWindow } from './schedule';
import { jobs, queueOrder, hold, persist } from './download-state';
import { readMaxConcurrent, readNightSchedule, readRetryConfig } from './download-settings';

// Queue runner (pump + single-job execution), extracted from
// `download-manager.ts` (plan 2.8). `running` (active job count) lives here
// because only pump() reads it and runJob() mutates it.

let running = 0;

export async function pump(): Promise<void> {
  if (hold.until && Date.now() < hold.until) return;
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
    const retryCfg = await readRetryConfig();
    for (let attempt = 1; attempt <= Math.max(1, retryCfg.attempts); attempt++) {
      const result = await runJobAttempt(job, bin, auth, base);
      if (result.finishedOk) {
        await postProcess(job);
        return;
      }
      const retryable = result.errorCode === 'network' || result.errorCode === 'bot-block';
      const status = job.status as IpcDownloadTask['status'];
      const stopped = status === 'cancelled' || status === 'paused';
      if (!retryable || stopped || attempt >= retryCfg.attempts) return;
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
      logger.info('downloads', `retrying ${job.id} (attempt ${attempt + 1}/${retryCfg.attempts})`);
      await new Promise((r) => setTimeout(r, retryCfg.baseMs * 2 ** (attempt - 1)));
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
