import { logger } from '../../shared/logger';

export interface BootWatchdogOptions {
  /** True, gdy renderer zgłosił `app:rendererReady`. */
  isRendererReady: () => boolean;
  /** Wywoływane raz, w terminie, jeśli renderer nigdy nie stał się gotowy. */
  onTimeout: () => void;
  intervalMs?: number;
  deadlineMs?: number;
}

export const BOOT_WATCHDOG_INTERVAL_MS = 5000;
export const BOOT_WATCHDOG_DEADLINE_MS = 30000;

/**
 * Nigdy nie ukrywaj zepsutego renderera za splashem na zawsze, ale też nigdy nie
 * pokazuj niepomalowanego okna tylko dlatego, że renderer jest wolny (zimny serwer
 * dev, pierwszy start po czyszczeniu cache, wolny dysk): ostrzegaj okresowo i wymuś
 * okno dopiero w terminie. Prawdziwe awarie (crash, fail-load, błąd preload)
 * zamykają splash natychmiast gdzie indziej.
 *
 * Zwraca funkcję stop; zatrzymuje się też sama po osiągnięciu gotowości lub przekroczeniu terminu.
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
