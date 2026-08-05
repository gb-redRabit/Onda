let cachedWindowId: number | null = null;
let windowIdPromise: Promise<number> | null = null;

export function getWindowId(): Promise<number> {
  if (cachedWindowId !== null) return Promise.resolve(cachedWindowId);
  if (!windowIdPromise) {
    windowIdPromise = (window.api?.getWindowId() ?? Promise.resolve(0)).then((id) => {
      cachedWindowId = id;
      return id;
    });
  }
  return windowIdPromise;
}

export function getCachedWindowId(): number {
  return cachedWindowId ?? 0;
}
