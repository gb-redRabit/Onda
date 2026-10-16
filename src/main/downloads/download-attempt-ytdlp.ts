import { spawn } from 'child_process';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger';
import type { IpcDownloadErrorCode } from '../../shared/types/ipc';
import {
  type Job,
  resolveOutputDir,
  outputExtensions,
  parseYtDlpProgress
} from './download-helpers';
import { buildYtArgs, type YtAuthConfig } from '../ipc/youtube/youtube-utils';
import { killDownloadProcess } from './kill-download-process';
import { resolveFinalOutputPath, findNewestOutput } from './output-path';
import { classifyYtDlpError, describeError, redactSecrets } from './error-classifier';
import { persist, persistThrottled, reportCompleted } from './download-state';

// Ścieżka yt-dlp: spawn procesu, parsowanie postępu i ustalenie realnej ścieżki
// wyjścia. Wyodrębnione z `download-attempt.ts` (plan 2.8).

const MAX_STDERR_BYTES = 64 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

// Uruchamia pojedynczy proces yt-dlp dla zadania. Zwraca informację, czy pobieranie
// zakończyło się sukcesem, oraz (przy niepowodzeniu) sklasyfikowany kod błędu.
export async function runYtDlpAttempt(
  job: Job,
  bin: string,
  auth: YtAuthConfig | null,
  base: string[]
): Promise<{ finishedOk: boolean; errorCode?: IpcDownloadErrorCode }> {
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
    persistThrottled(job);
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

  let finishedOk = false;
  let attemptSettled = false;
  // Awaria spawnowania (ENOENT itd.) może wyemitować 'error', a potem 'close' z
  // kodem != 0. Bez tej flagi 'close' nadpisałby precyzyjny błąd generykiem.
  let spawnErrored = false;
  let settleAttempt: () => void = () => {};
  // Awaria spawnowania (np. ENOENT) emituje tylko 'error'. Bez rozstrzygnięcia
  // oczekującej obietnicy `running` w runnerze nigdy by nie zmalało, a `pump()`
  // stanąłby na stałe — kolejka nie ruszyłaby do restartu.
  child.on('error', (err) => {
    spawnErrored = true;
    job.status = 'error';
    job.error = redactSecrets(err.message);
    job.errorCode = classifyYtDlpError(err.message);
    persist(job);
    settleAttempt();
  });

  await new Promise<void>((resolve) => {
    const settle = (): void => {
      if (attemptSettled) return;
      attemptSettled = true;
      resolve();
    };
    settleAttempt = settle;
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
        settle();
      }
    }, DOWNLOAD_TIMEOUT_MS);
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        settle();
        return;
      }
      if (spawnErrored) {
        // 'error' już ustawiło konkretny komunikat/kod; 'close' nie może go nadpisać.
        settle();
        return;
      }
      if (job.status === 'cancelled' || job.status === 'paused') {
        settle();
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
      settle();
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
