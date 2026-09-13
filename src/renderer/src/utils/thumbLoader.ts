export const thumbTasks: (() => void)[] = [];
let thumbActive = 0;
const THUMB_MAX = 3;
const CACHE_MAX = 500;
export const thumbCache = new Map<string, string>();
const iconCache = new Map<string, string>();
const thumbAccessOrder: string[] = [];
const iconAccessOrder: string[] = [];

// An empty NativeImage serialises to `data:image/png;base64,` (no payload).
// Treat anything without a real payload as "no image" so the explorer never
// renders a broken <img> placeholder and never caches a blank icon.
export function isUsableImageDataUrl(v: string | null | undefined): v is string {
  if (!v || typeof v !== 'string') return false;
  const m = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(v);
  return !!m && m[1].length > 0;
}

function lruGet(cache: Map<string, string>, order: string[], key: string): string | undefined {
  const val = cache.get(key);
  if (val !== undefined) {
    const idx = order.indexOf(key);
    if (idx > 0) {
      order.splice(idx, 1);
      order.unshift(key);
    }
  }
  return val;
}

function lruSet(cache: Map<string, string>, order: string[], key: string, val: string) {
  if (order.length >= CACHE_MAX) {
    const evicted = order.pop()!;
    cache.delete(evicted);
  }
  const idx = order.indexOf(key);
  if (idx >= 0) order.splice(idx, 1);
  order.unshift(key);
  cache.set(key, val);
}

export function cachedThumb(path: string): string | undefined {
  const v = lruGet(thumbCache, thumbAccessOrder, path);
  return isUsableImageDataUrl(v) ? v : undefined;
}

export function setCachedThumb(path: string, dataUrl: string) {
  if (!isUsableImageDataUrl(dataUrl)) return;
  lruSet(thumbCache, thumbAccessOrder, path, dataUrl);
}

export function cachedIcon(path: string): string | undefined {
  const v = lruGet(iconCache, iconAccessOrder, path);
  return isUsableImageDataUrl(v) ? v : undefined;
}

export function setCachedIcon(path: string, icon: string) {
  if (!isUsableImageDataUrl(icon)) return;
  lruSet(iconCache, iconAccessOrder, path, icon);
}

export function processThumbQueue() {
  while (thumbActive < THUMB_MAX && thumbTasks.length > 0) {
    const task = thumbTasks.shift()!;
    thumbActive++;
    task();
  }
}

export function thumbTaskDone(): void {
  thumbActive--;
  processThumbQueue();
}
