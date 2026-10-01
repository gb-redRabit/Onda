/**
 * Trailing-edge debounce: the wrapped function runs once, `waitMs` after the
 * last call. Used for the window `resize` listener so dragging a window edge
 * does not evaluate the narrow-layout threshold on every event.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}
