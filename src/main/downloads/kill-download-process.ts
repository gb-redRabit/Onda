import { spawn } from 'node:child_process';
import { logger } from '../../shared/logger';

/**
 * Terminates a download process and everything it started.
 *
 * `child.kill()` signals one process. yt-dlp spawns ffmpeg, and on Windows that
 * grandchild is not in the job's process tree as far as Node is concerned, so
 * cancelling a job used to leave ffmpeg running: still writing to the output
 * file, still holding the handle, and unkillable from the UI because the job it
 * belonged to no longer exists. A retried job then competed with the orphan for
 * the same destination.
 *
 * Two things are needed:
 *
 * - **tree kill** — on Windows `taskkill /T /F`, because there is no process
 *   group to signal; on POSIX the child is spawned `detached`, making it a group
 *   leader, and a negative PID signals the whole group.
 * - **escalation** — SIGTERM first, SIGKILL if the process is still there after
 *   the grace period. yt-dlp handles SIGTERM and cleans up its partial file, so
 *   a hard kill from the start would leave a truncated `.part` behind.
 */

/** How long a process gets to exit on its own before it is killed outright. */
const KILL_GRACE_MS = 2000;

/** Windows refuses `taskkill` on a process we no longer own; don't retry. */
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
    // taskkill can hang on a wedged process tree; do not let it hold a handle.
    killer.unref?.();
    setTimeout(() => {
      if (!killer.killed) killer.kill();
    }, TASKKILL_TIMEOUT_MS).unref?.();
  } catch (e) {
    logger.warn('download', `taskkill for ${pid} could not start`, e);
  }
}

/** Signals the process group (POSIX) or the process tree (Windows). */
function signalTree(child: KillableChild, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    if (child.pid) spawnTaskkill(child.pid);
    return;
  }
  if (!child.pid) {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
    return;
  }
  try {
    // Negative PID = the whole group. The child is a group leader because it is
    // spawned detached, so this reaches the ffmpeg it started.
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH (already gone) or EPERM (group setup differs) — fall back to the
    // single process rather than leaving it running.
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Terminates a child and its descendants, escalating to an unconditional kill
 * after {@link KILL_GRACE_MS}. Safe to call on an already-dead process and safe
 * to call twice.
 */
export function killDownloadProcess(child: KillableChild | null | undefined): void {
  if (!child || child.killed) return;

  const escalate = setTimeout(() => {
    // If the process is gone, 'exit' has fired and the timer was already cleared.
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
