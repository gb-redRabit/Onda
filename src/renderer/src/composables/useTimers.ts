import { onUnmounted } from 'vue';

export function useTimeoutFn(callback: () => void, delay: number) {
  let id: ReturnType<typeof setTimeout> | null = null;

  const stop = (): void => {
    if (id) {
      clearTimeout(id);
      id = null;
    }
  };

  const start = (): void => {
    stop();
    id = setTimeout(callback, delay);
  };

  onUnmounted(stop);
  return { start, stop };
}

export function useIntervalFn(
  callback: () => void,
  interval: number,
  options: { immediate?: boolean } = {}
) {
  let id: ReturnType<typeof setInterval> | null = null;

  const pause = (): void => {
    if (id) {
      clearInterval(id);
      id = null;
    }
  };

  const resume = (): void => {
    if (id !== null) return;
    id = setInterval(callback, interval);
  };

  if (options.immediate ?? false) resume();
  onUnmounted(pause);
  return { pause, resume };
}

export function useRafFn(callback: () => void) {
  let id: number | null = null;
  let running = false;

  const loop = (): void => {
    if (!running) return;
    callback();
    if (!running) return;
    id = requestAnimationFrame(loop);
  };

  const pause = (): void => {
    running = false;
    if (id !== null) {
      cancelAnimationFrame(id);
      id = null;
    }
  };

  const resume = (): void => {
    if (running) return;
    running = true;
    id = requestAnimationFrame(loop);
  };

  onUnmounted(pause);
  return { pause, resume };
}

export function useDebounceFn(
  fn: (...args: never[]) => void,
  wait: number
): ((...args: unknown[]) => void) & { cancel: () => void } {
  let id: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (id) {
      clearTimeout(id);
      id = null;
    }
  };

  const debounced = (...args: unknown[]): void => {
    if (id) clearTimeout(id);
    id = setTimeout(() => {
      id = null;
      fn(...(args as never[]));
    }, wait);
  };

  debounced.cancel = cancel;
  onUnmounted(cancel);
  return debounced;
}
