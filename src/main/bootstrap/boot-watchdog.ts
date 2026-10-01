import { logger } from '../../shared/logger';

export interface BootWatchdogOptions {
  /** True once the renderer has signalled `app:rendererReady`. */
  isRendererReady: () => boolean;
  /** Called once, at the deadline, if the renderer never became ready. */
  onTimeout: () => void;
  intervalMs?: number;
  deadlineMs?: number;
}

export const BOOT_WATCHDOG_INTERVAL_MS = 5000;
export const BOOT_WATCHDOG_DEADLINE_MS = 30000;

/**
 * Never hide a broken renderer behind the splash forever, but also never flash
 * an unpainted window just because the renderer is slow (cold dev server, first
 * run after a cache clear, slow disk): warn periodically and force the window
 * only at the deadline. Real failures (crash, fail-load, preload error) close
 * the splash immediately elsewhere.
 *
 * Returns a stop function; it also stops itself once ready or timed out.
 */
export function startBootWatchdog(options: BootWatchdogOptions): () => void {
  const intervalMs = options.intervalMs ?? BOOT_WATCHDOG_INTERVAL_MS;
  const deadlineMs = options.deadlineMs ?? BOOT_WATCHDOG_DEADLINE_MS;
  const startedAt = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  timer = setInterval(() => {
    if (options.isRendererReady()) {
      stop();
      return;
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed >= deadlineMs) {
      stop();
      logger.warn('boot', `renderer not ready after ${elapsed}ms — showing the window anyway`);
      options.onTimeout();
      return;
    }
    logger.warn('boot', `renderer still booting (${elapsed}ms) — splash kept visible`);
  }, intervalMs);

  return stop;
}
