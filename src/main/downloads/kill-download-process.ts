import { spawn } from 'node:child_process';
import { logger } from '../../shared/logger';

/**
 * Kończy proces pobierania i wszystko, co uruchomił.
 *
 * `child.kill()` sygnalizuje jeden proces. yt-dlp spawnuje ffmpeg, a w Windows
 * ten wnuk nie znajduje się w drzewie procesów zadania z punktu widzenia Node,
 * więc anulowanie zadania pozostawiało ffmpeg działający: wciąż zapisujący do pliku
 * wyjściowego, wciąż trzymający uchwyt i niemożliwy do zabicia z UI, bo zadanie,
 * do którego należał, już nie istniało. Ponowione zadanie konkurowało wtedy z
 * sierotą o to samo miejsce docelowe.
 *
 * Potrzebne są dwie rzeczy:
 *
 * - **tree kill** — w Windows `taskkill /T /F`, bo nie ma grupy procesów, którą
 *   można zasygnalizować; na POSIX proces potomny jest spawnowany jako `detached`,
 *   co czyni go liderem grupy, a ujemny PID sygnalizuje całą grupę.
 * - **eskalacja** — najpierw SIGTERM, SIGKILL, jeśli proces nadal istnieje po
 *   okresie karencji. yt-dlp obsługuje SIGTERM i sprząta swój częściowy plik, więc
 *   twarde zabicie od razu pozostawiłoby obcięty `.part`.
 */

/** Ile czasu proces ma na samodzielne zakończenie, zanim zostanie zabity bezwarunkowo. */
const KILL_GRACE_MS = 2000;

/** Windows odmawia `taskkill` na procesie, którego już nie posiadamy; nie ponawiaj. */
const TASKKILL_TIMEOUT_MS = 5000;

export interface KillableChild {
  pid?: number | undefined;
  killed: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'exit' | 'close', listener: () => void): unknown;
  removeListener(event: 'exit' | 'close', listener: () => void): unknown;
}

function spawnTaskkill(pid: number): void {
  try {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    killer.on('error', (err) => {
      logger.warn('download', `taskkill for ${pid} failed`, err);
    });
    // taskkill może zawiesić się na zablokowanym drzewie procesów; nie pozwól mu trzymać uchwytu.
    killer.unref?.();
    setTimeout(() => {
      if (!killer.killed) killer.kill();
    }, TASKKILL_TIMEOUT_MS).unref?.();
  } catch (e) {
    logger.warn('download', `taskkill for ${pid} could not start`, e);
  }
}

/** Sygnalizuje grupę procesów (POSIX) lub drzewo procesów (Windows). */
function signalTree(child: KillableChild, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    if (child.pid) spawnTaskkill(child.pid);
    return;
  }
  if (!child.pid) {
    try {
      child.kill(signal);
    } catch {
      /* już nie istnieje */
    }
    return;
  }
  try {
    // Ujemny PID = cała grupa. Proces potomny jest liderem grupy, bo jest
    // spawnowany jako detached, więc to dociera do ffmpeg, którego uruchomił.
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH (już nie istnieje) lub EPERM (inne ustawienie grupy) — przejdź do
    // pojedynczego procesu zamiast zostawiać go działającego.
    try {
      child.kill(signal);
    } catch {
      /* już nie istnieje */
    }
  }
}

/**
 * Kończy proces potomny i jego potomków, eskalując do bezwarunkowego zabicia
 * po {@link KILL_GRACE_MS}. Bezpieczne do wywołania na już martwym procesie i
 * bezpieczne do wywołania dwukrotnie.
 */
export function killDownloadProcess(child: KillableChild | null | undefined): void {
  if (!child || child.killed) return;

  const escalate = setTimeout(() => {
    // Jeśli proces zniknął, 'exit' zadziałał, a timer został już wyczyszczony.
    if (child.killed) return;
    logger.warn('download', `pid ${child.pid ?? '?'} ignored SIGTERM — sending SIGKILL`);
    signalTree(child, 'SIGKILL');
  }, KILL_GRACE_MS);
  escalate.unref?.();

  const done = (): void => {
    clearTimeout(escalate);
    child.removeListener('exit', done);
    child.removeListener('close', done);
  };
  child.once('exit', done);
  child.once('close', done);

  try {
    signalTree(child, 'SIGTERM');
  } catch (e) {
    clearTimeout(escalate);
    logger.warn('download', `could not signal pid ${child.pid ?? '?'}`, e);
  }
}
