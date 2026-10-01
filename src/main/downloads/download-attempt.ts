import { spawn } from 'child_process';
import { mkdir, readdir, stat } from 'fs/promises';
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
import { buildYtArgs, type YtAuthConfig } from '../ipc/youtube/youtube-utils';
import { killDownloadProcess } from './kill-download-process';
import { resolveFinalOutputPath, findNewestOutput } from './output-path';
import { downloadHttpFile } from './http-downloader';
import { resolveSourceHeaders } from '../ipc/generic-fetch';
import { resolveScDownloadSource } from '../ipc/soundcloud/soundcloud-client';
import { classifyYtDlpError, describeError, redactSecrets } from './error-classifier';
import { addAllowedRoot } from '../media/media-server';
import { persist, reportCompleted, jobAbortControllers } from './download-state';

// Pojedyncza próba pobierania (strumień HTTP lub proces yt-dlp) dla jednego
// zadania, wyodrębniona z `download-manager.ts` (plan 2.8).

const MAX_STDERR_BYTES = 64 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

// Pobieranie z bezpośredniego URL (source): strumieniuje plik z postępem, potem
// przechodzi do wspólnego postProcess (sync biblioteki, hash). Bez udziału yt-dlp.
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
        persist(job);
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

// Uruchamia pojedynczy proces yt-dlp dla zadania. Zwraca informację, czy pobieranie
// zakończyło się sukcesem, oraz (przy niepowodzeniu) sklasyfikowany kod błędu.
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
  const args = buildYtArgs(base, auth);
  // W Windows yt-dlp wypisuje linie "Destination:" na stdout w kodowaniu strony
  // konsoli, co zniekształciłoby nazwy spoza ASCII przy dekodowaniu jako UTF-8. Wymuś
  // wyjście UTF-8, aby sparsowane ścieżki zgadzały się z rzeczywistymi plikami na dysku.
  const child = spawn(bin, args, {
    windowsHide: true,
    // Lider grupy, aby anulowanie mogło zasygnalizować całą grupę i dotrzeć do
    // ffmpeg, którego spawnuje yt-dlp. Bez tego ginie tylko yt-dlp, a ffmpeg dalej
    // zapisuje do pliku wyjściowego. Potoki stdio nie są dotknięte odłączeniem.
    detached: process.platform !== 'win32',
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
        killDownloadProcess(child);
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

// Linie "Destination:" sparsowane ze stdout yt-dlp mogą być zniekształcone dla
// nazw spoza ASCII (kodowanie strony konsoli Windows), podczas gdy pliki na dysku
// zawsze mają poprawną nazwę Unicode. Ustal rzeczywistą ścieżkę końcową, weryfikując
// sparsowane destinations względem systemu plików; w ostateczności wybierz najnowszy
// pasujący plik w katalogu wyjściowym.
async function resolveRealOutputPath(job: Job, destinations: string[]): Promise<void> {
  // Sprawdza każdego kandydata współbieżnie, poza głównym wątkiem, aby wolny dysk
  // nie blokował pętli zdarzeń (statSync tutaj blokował całe IPC podczas pobierania).
  const existing = new Set<string>();
  await Promise.all(
    destinations.map(async (p) => {
      if (!p) return;
      try {
        if ((await stat(p)).isFile()) existing.add(p);
      } catch {
        // kandydat nie istnieje
      }
    })
  );
  let real = resolveFinalOutputPath(destinations, (p) => existing.has(p));
  if (!real) {
    try {
      const dir = resolveOutputDir(job);
      const entries = await readdir(dir, { withFileTypes: true });
      const stamped = await Promise.all(
        entries.map(async (e) => {
          try {
            return { name: e.name, mtimeMs: (await stat(join(dir, e.name))).mtimeMs };
          } catch {
            return { name: e.name, mtimeMs: 0 };
          }
        })
      );
      const name = findNewestOutput(stamped, outputExtensions(job), job.startedAt);
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
