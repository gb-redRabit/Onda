import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import type { IpcDownloadErrorCode } from '../../shared/types/ipc';
import {
  type Job,
  resolveOutputDir,
  formatBytes,
  formatEta,
  deriveHttpFileName
} from './download-helpers';
import { downloadHttpFile } from './http-downloader';
import { safeDownloadFileName } from './download-source';
import { resolveSourceHeaders } from '../ipc/generic-fetch';
import { classifyYtDlpError, redactSecrets } from './error-classifier';
import { addAllowedRoot } from '../media/media-server';
import { persist, persistThrottled, reportCompleted } from './download-state';

// Próby pobierania do pliku bez udziału yt-dlp: bezpośredni HTTP oraz strumień
// providera (np. MEGA). Wyodrębnione z `download-attempt.ts` (plan 2.8).

// Pobieranie z bezpośredniego URL (source): strumieniuje plik z postępem, potem
// przechodzi do wspólnego postProcess (sync biblioteki, hash). Bez udziału yt-dlp.
export async function runHttpAttempt(
  job: Job,
  signal?: AbortSignal
): Promise<{ finishedOk: boolean; errorCode?: IpcDownloadErrorCode }> {
  const dir = resolveOutputDir(job);
  await mkdir(dir, { recursive: true });
  void addAllowedRoot(dir);
  // Druga linia obrony: nawet gdyby do kolejki trafiło (np. z zapisanej starszej
  // wersji) `fileName` z separatorami, bierzemy tylko bezpieczną nazwę bazową.
  const fileName = safeDownloadFileName(job.source?.fileName) || deriveHttpFileName(job);
  const destPath = join(dir, fileName);
  job.outputPath = destPath;
  persist(job);
  const headers = {
    ...(await resolveSourceHeaders(job.source?.apiKeyId, job.source?.headerName)),
    ...(job.source?.headers ?? {})
  };
  const startedAt = Date.now();
  try {
    await downloadHttpFile({
      url: job.url,
      destPath,
      headers,
      allowPrivateNetwork: job.source?.allowPrivateNetwork,
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
        persistThrottled(job);
      }
    });
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    persist(job);
    // Zadania HTTP/direct-URL kończą się tutaj, a nie w ścieżce spawn yt-dlp, więc
    // księgowość "downloaded" (subskrypcje + źródła) musi zadziałać również tutaj.
    reportCompleted(job);
    return { finishedOk: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Jeśli zadanie zostało wstrzymane/anulowane (przez AbortController), nie nadpisuj
    // statusu na 'error' — wywołujący już ustawił go poprawnie.
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

// Pobieranie ze STRUMIENIA providera (np. MEGA — deszyfrowanie po stronie klienta).
// Zapisuje strumień do pliku z postępem i tą samą księgowością ukończenia co HTTP.
// Uwaga: brak wsparcia dla pauzy/anulowania w trakcie (brak procesu/AbortController).
export async function runStreamAttempt(
  job: Job,
  stream: NodeJS.ReadableStream,
  totalSize?: number,
  signal?: AbortSignal
): Promise<{ finishedOk: boolean; errorCode?: IpcDownloadErrorCode }> {
  const dir = resolveOutputDir(job);
  await mkdir(dir, { recursive: true });
  void addAllowedRoot(dir);
  const fileName = safeDownloadFileName(job.source?.fileName) || deriveHttpFileName(job);
  const destPath = join(dir, fileName);
  job.outputPath = destPath;
  persist(job);
  const startedAt = Date.now();
  let received = 0;
  // Pauza/anulowanie: przerwij strumień (MEGA nie ma procesu potomnego do zabicia).
  const onAbort = (): void => {
    try {
      (stream as import('stream').Readable).destroy(new Error('aborted'));
    } catch {
      // strumień już zamknięty
    }
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (job.status === 'downloading') {
        if (totalSize && totalSize > 0) {
          job.progress = Math.min(100, Math.round((received / totalSize) * 100));
        }
        const elapsed = (Date.now() - startedAt) / 1000;
        if (elapsed > 0.5) {
          const bps = received / elapsed;
          job.speed = `${formatBytes(bps)}/s`;
          if (totalSize) job.eta = formatEta((totalSize - received) / Math.max(bps, 1));
        }
        persistThrottled(job);
      }
      cb(null, chunk);
    }
  });
  try {
    await pipeline(stream as import('stream').Readable, counter, createWriteStream(destPath));
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    persist(job);
    reportCompleted(job);
    return { finishedOk: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const alreadyStopped = job.status === 'paused' || job.status === 'cancelled';
    if (!alreadyStopped) {
      job.status = 'error';
      job.error = redactSecrets(msg);
      job.errorCode = classifyYtDlpError(msg);
    }
    persist(job);
    return { finishedOk: false, errorCode: job.errorCode };
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
