export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return `${window.api.mediaServerUrl}/?path=${encodeURIComponent(normalized)}`;
}

export function createAudioElement(existingEl: HTMLAudioElement | null): HTMLAudioElement {
  if (existingEl) {
    existingEl.pause();
    existingEl.removeAttribute('src');
  }
  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  return el;
}

export function cleanupAudioElement(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}
