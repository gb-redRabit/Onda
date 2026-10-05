import { LruCache } from './lruCache';

export const thumbTasks: (() => void)[] = [];
let thumbActive = 0;
const THUMB_MAX = 3;
const CACHE_MAX = 500;
// Wspólna implementacja LRU (zamiast ręcznej pary Map + tablica kolejności).
const thumbCache = new LruCache<string>(CACHE_MAX);
const iconCache = new LruCache<string>(CACHE_MAX);

// Pusty NativeImage serializuje się do `data:image/png;base64,` (bez payloadu).
// Traktuj wszystko bez prawdziwego payloadu jako "brak obrazu", tak by eksplorator nigdy
// nie renderował zepsutego placeholdera <img> i nigdy nie cache'ował pustej ikony.
export function isUsableImageDataUrl(v: string | null | undefined): v is string {
  if (!v || typeof v !== 'string') return false;
  const m = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(v);
  return !!m && m[1].length > 0;
}

export function cachedThumb(path: string): string | undefined {
  const v = thumbCache.get(path);
  return isUsableImageDataUrl(v) ? v : undefined;
}

export function setCachedThumb(path: string, dataUrl: string) {
  if (!isUsableImageDataUrl(dataUrl)) return;
  thumbCache.set(path, dataUrl);
}

export function cachedIcon(path: string): string | undefined {
  const v = iconCache.get(path);
  return isUsableImageDataUrl(v) ? v : undefined;
}

export function setCachedIcon(path: string, icon: string) {
  if (!isUsableImageDataUrl(icon)) return;
  iconCache.set(path, icon);
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
