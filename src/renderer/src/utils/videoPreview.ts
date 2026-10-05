import { ref, type Ref } from 'vue';
import { formatDuration } from '@renderer/utils/formatters';

// Wspólny rdzeń podglądu klatek: ukryty <video> jest przewijany do wskazanego czasu,
// a jego klatka rysowana na canvas jako data URL JPEG. Używany zarówno przez pasek
// przewijania odtwarzacza, jak i przez okno PiP (różnią się tylko rozmiarem/kryciem
// i opóźnieniem seeka).
export interface VideoPreviewConfig {
  width: number;
  height: number;
  quality: number;
  seekDebounceMs: number;
  videoRef: Ref<HTMLVideoElement | null>;
  progressRef: Ref<HTMLElement | null>;
}

export function createVideoPreviewCore(config: VideoPreviewConfig) {
  const { width, height, quality, seekDebounceMs, videoRef, progressRef } = config;

  const hiddenVideoRef = ref<HTMLVideoElement | null>(null);
  const previewVisible = ref(false);
  const previewTime = ref(0);
  const previewDataUrl = ref<string | null>(null);
  const previewLeft = ref(0);

  let canvas: HTMLCanvasElement | null = null;
  let seekTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastSrc = '';

  function getCanvas(): HTMLCanvasElement {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }

  function drawFrame(): void {
    const hv = hiddenVideoRef.value;
    if (!hv || hv.readyState < 2) return;
    const c = getCanvas();
    const ctx = c.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(hv, 0, 0, width, height);
      previewDataUrl.value = c.toDataURL('image/jpeg', quality);
    } catch {
      previewDataUrl.value = null;
    }
  }

  function syncHiddenSource(): void {
    const hv = hiddenVideoRef.value;
    const v = videoRef.value;
    if (!hv || !v) return;
    const src = v.currentSrc || v.src;
    if (!src || src === lastSrc) return;
    lastSrc = src;
    previewDataUrl.value = null;
    hv.crossOrigin = 'anonymous';
    hv.src = src;
    hv.load();
  }

  function seekTo(time: number): void {
    const hv = hiddenVideoRef.value;
    if (!hv || !Number.isFinite(time)) return;
    syncHiddenSource();
    try {
      hv.currentTime = Math.max(0, Math.min(time, hv.duration || time));
    } catch {
      previewDataUrl.value = null;
    }
  }

  function handleMouseMove(e: MouseEvent): void {
    const bar = progressRef.value;
    const v = videoRef.value;
    if (!bar || !v || !Number.isFinite(v.duration)) return;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = rect.width > 0 ? x / rect.width : 0;
    previewVisible.value = true;
    previewTime.value = pct * v.duration;
    previewLeft.value = Math.max(0, Math.min(pct * 100, 100));
    if (seekTimeout) clearTimeout(seekTimeout);
    seekTimeout = setTimeout(() => seekTo(previewTime.value), seekDebounceMs);
  }

  function handleMouseLeave(): void {
    previewVisible.value = false;
    if (seekTimeout) {
      clearTimeout(seekTimeout);
      seekTimeout = null;
    }
  }

  function setHiddenVideoRef(el: unknown): void {
    hiddenVideoRef.value = el as HTMLVideoElement | null;
  }

  /** Wołane z `onMounted` komponentu (ukryty <video> musi już istnieć w DOM). */
  function setup(): void {
    const hv = hiddenVideoRef.value;
    if (!hv) return;
    hv.muted = true;
    hv.playsInline = true;
    hv.preload = 'auto';
    hv.crossOrigin = 'anonymous';
    hv.addEventListener('seeked', drawFrame);
    hv.addEventListener('loadedmetadata', drawFrame);
  }

  /** Wołane z `onUnmounted` komponentu. */
  function teardown(): void {
    if (seekTimeout) clearTimeout(seekTimeout);
    const hv = hiddenVideoRef.value;
    if (!hv) return;
    hv.removeEventListener('seeked', drawFrame);
    hv.removeEventListener('loadedmetadata', drawFrame);
    hv.pause();
    hv.removeAttribute('src');
    hv.load();
  }

  return {
    hiddenVideoRef,
    previewVisible,
    previewTime,
    previewDataUrl,
    previewLeft,
    previewTimeLabel: (): string => formatDuration(previewTime.value),
    setHiddenVideoRef,
    handleMouseMove,
    handleMouseLeave,
    drawFrame,
    setup,
    teardown
  };
}
