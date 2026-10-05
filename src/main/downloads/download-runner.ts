import { logger } from '../../shared/logger';
import type { IpcDownloadTask } from '../../shared/types/ipc';
import { type Job } from './download-helpers';
import { resolveBin } from '../binaries';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube/youtube-auth';
import type { YtAuthConfig } from '../ipc/youtube/youtube-utils';
import { buildBaseArgs } from './download-args';
import { runJobAttempt } from './download-attempt';
import { postProcess } from './download-post-process';
import { classifyYtDlpError, redactSecrets } from './error-classifier';
import { isWithinWindow, msUntilWindowStart } from './schedule';
import { jobs, queueOrder, hold, persist } from './download-state';
import { readMaxConcurrent, readNightSchedule, readRetryConfig } from './download-settings';
import type { NightSchedule } from './download-settings';

// Runner kolejki (pump + wykonanie pojedynczego zadania), wyodrębniony z
// `download-manager.ts` (plan 2.8). `running` (liczba aktywnych zadań) znajduje
// się tutaj, bo tylko pump() je odczytuje, a runJob() je modyfikuje.

let running = 0;
// Jednorazowy budzik na otwarcie okna nocnego. Bez niego kolejka wstrzymana
// przez harmonogram nocny nie miała kto obudzić.
let nightTimer: ReturnType<typeof setTimeout> | null = null;

function clearNightTimer(): void {
  if (nightTimer) {
    clearTimeout(nightTimer);
    nightTimer = null;
  }
}

function scheduleNightPump(night: NightSchedule): void {
  clearNightTimer();
  const delay = msUntilWindowStart(night.start, night.end);
  if (delay <= 0) return;
  nightTimer = setTimeout(() => {
    nightTimer = null;
    void pump();
  }, delay);
}

export async function pump(): Promise<void> {
  if (hold.until && Date.now() < hold.until) return;
  const night = await readNightSchedule();
  if (night.enabled && !isWithinWindow(new Date().getHours(), night.start, night.end)) {
    scheduleNightPump(night);
    return;
  }
  clearNightTimer();
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
    // Może być null, gdy autoryzacja jest wyłączona ("none") lub nie istnieje
    // ważna sesja — publiczne filmy nadal można pobierać bez cookies, a yt-dlp
    // zgłasza konkretny błąd dla treści z ograniczeniem wieku / prywatnych / tylko dla członków.
    auth = await getYtAuthConfig();
    const base = await buildBaseArgs(job);
    const retryCfg = await readRetryConfig();
    for (let attempt = 1; attempt <= Math.max(1, retryCfg.attempts); attempt++) {
      const result = await runJobAttempt(job, bin, auth, base);
      if (result.finishedOk) {
        await postProcess(job);
        return;
      }
      // Ponowienia warte jest tylko niepowodzenie transportu. `bot-block` to YouTube
      // mówiący "zbyt wiele żądań z tego adresu" — natychmiastowe ponawianie to właśnie
      // to, co eskaluje 429 do bana na IP, a backoff jest i tak zbyt krótki, by mieć
      // znaczenie. Wymaga to od użytkownika odczekania lub zalogowania się.
      const retryable = result.errorCode === 'network';
      const status = job.status as IpcDownloadTask['status'];
      const stopped = status === 'cancelled' || status === 'paused';
      if (!retryable || stopped || attempt >= retryCfg.attempts) return;
      // Resetuje stan przejściowy i ponawia po wykładniczym backoffie. Błędy
      // prywatności, praw dostępu, nieznalezienia i bot-block nigdy nie są ponawiane.
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
      // Ponownie sprawdza status po backoffie — użytkownik mógł wstrzymać/anulować
      // podczas oczekiwania (job.child jest undefined, więc pause/cancel nie może go zabić).
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
