import { logger } from '../../shared/logger';
import type { IpcDownloadErrorCode } from '../../shared/types/ipc';
import type { Job } from './download-helpers';
import type { YtAuthConfig } from '../ipc/youtube/youtube-utils';
import { resolveProviderFileUrl, settleProviderDownload } from '../ipc/providers/registry';
import { resolveScDownloadSource } from '../ipc/soundcloud/soundcloud-client';
import { classifyYtDlpError, redactSecrets } from './error-classifier';
import { persist, jobAbortControllers } from './download-state';
import { runHttpAttempt, runStreamAttempt } from './download-attempt-http';
import { runYtDlpAttempt } from './download-attempt-ytdlp';

// Orkiestrator pojedynczej próby pobierania: wybiera tor (HTTP, strumień providera,
// SoundCloud, yt-dlp) i pilnuje cyklu AbortController. Same tory żyją w
// `download-attempt-http.ts` i `download-attempt-ytdlp.ts` (plan 2.8).
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
  if (job.source?.mode === 'provider') {
    const { providerId, providerRef, providerItemId } = job.source;
    if (!providerId || !providerRef || !providerItemId) {
      job.status = 'error';
      job.error = 'Invalid provider source';
      job.errorCode = 'unknown';
      persist(job);
      return { finishedOk: false, errorCode: 'unknown' };
    }
    // Widoczny status fazy przygotowania (rozwiązywanie linku / „转存" / oczekiwanie).
    const setStatus = (key: string): void => {
      job.message = key;
      persist(job);
    };
    setStatus('downloads.statusChecking');
    try {
      // Linki providerów (PikPak/MEGA/Drive…) są podpisane i wygasają — rozwiąż
      // ŚWIEŻY bezpośredni URL na początku każdej próby, aby ponowienia nigdy nie
      // odtwarzały wygasłego podpisu. `forDownload=true`: provider może wykonać akcje
      // jednorazowe dla pobrania (np. PikPak „转存" na dysk, by dostać oryginał).
      const resolved = await resolveProviderFileUrl(
        providerId,
        providerRef,
        providerItemId,
        undefined,
        true,
        setStatus
      );
      // Providerzy deszyfrujący po stronie klienta (MEGA) zwracają strumień zamiast URL-a.
      if (resolved.stream) {
        const ac = new AbortController();
        jobAbortControllers.set(job.id, ac);
        try {
          return await runStreamAttempt(job, resolved.stream, resolved.size, ac.signal);
        } finally {
          jobAbortControllers.delete(job.id);
        }
      }
      if (!resolved.url) throw new Error('Provider nie zwrócił URL-a ani strumienia');
      job.url = resolved.url;
      job.source = {
        ...job.source,
        headers: { ...(job.source.headers ?? {}), ...(resolved.headers ?? {}) }
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      job.message = undefined;
      job.status = 'error';
      job.error = redactSecrets(msg);
      job.errorCode = classifyYtDlpError(msg);
      persist(job);
      return { finishedOk: false, errorCode: job.errorCode };
    }
    // Rozwiązano link — dalsze fazy pokazuje już postęp pobierania (speed/eta).
    job.message = undefined;
    const ac = new AbortController();
    jobAbortControllers.set(job.id, ac);
    let result: { finishedOk: boolean; errorCode?: IpcDownloadErrorCode };
    try {
      result = await runHttpAttempt(job, ac.signal);
    } finally {
      jobAbortControllers.delete(job.id);
    }
    // Sprzątanie po zakończeniu pobrania (sukces LUB błąd) — np. PikPak usuwa tymczasową
    // kopię z dysku (trwale), żeby nie zajmowała miejsca.
    try {
      await settleProviderDownload(providerRef, providerItemId);
    } catch (e) {
      logger.warn('downloads', 'provider settle cleanup failed', e);
    }
    return result;
  }
  if (job.source?.mode === 'soundcloud') {
    let resolved: string | null = null;
    try {
      // Linki CDN SoundCloud są podpisane i ograniczone czasowo: pobierz ŚWIEŻY
      // URL progresywnego MP3 na początku każdej próby, aby ponowienia nigdy
      // nie odtwarzały wygasłego podpisu.
      resolved = await resolveScDownloadSource(job.url);
    } catch (e) {
      // Brak transkodowania progresywnego (Go+ gated / tylko HLS) — zdegraduj tę
      // próbę do pipeline'u yt-dlp, który obsługuje HLS przez ffmpeg i
      // nadal tworzy odtwarzalny plik audio.
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
    // przechodzi dalej do ścieżki spawn yt-dlp poniżej
  }
  return await runYtDlpAttempt(job, bin, auth, base);
}
