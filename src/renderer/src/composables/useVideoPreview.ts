import { ref, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { formatDuration } from '@renderer/utils/formatters';

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;
const SEEK_DEBOUNCE_MS = 60;

// Realtime frame extraction preview for the main video player's seek bar.
// Mirrors usePipVideoPreview: a hidden <video> is seeked to the hovered time
// and its frame is drawn to a canvas as a JPEG data URL.
export function useVideoPreview(
  videoRef: Ref<HTMLVideoElement | null>,
  progressRef: Ref<HTMLElement | null>
) {
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
      canvas.width = PREVIEW_WIDTH;
      canvas.height = PREVIEW_HEIGHT;
    }
    return canvas;
  }

  function drawFrame() {
    const hv = hiddenVideoRef.value;
    if (!hv || hv.readyState < 2) return;
    const c = getCanvas();
    const ctx = c.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(hv, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      previewDataUrl.value = c.toDataURL('image/jpeg', 0.8);
    } catch {
      previewDataUrl.value = null;
    }
  }

  function syncHiddenSource() {
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

  function seekTo(time: number) {
    const hv = hiddenVideoRef.value;
    if (!hv || !Number.isFinite(time)) return;
    syncHiddenSource();
    try {
      hv.currentTime = Math.max(0, Math.min(time, hv.duration || time));
    } catch {
      previewDataUrl.value = null;
    }
  }

  function onMouseMove(e: MouseEvent) {
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
    seekTimeout = setTimeout(() => seekTo(previewTime.value), SEEK_DEBOUNCE_MS);
  }

  function onMouseLeave() {
    previewVisible.value = false;
    if (seekTimeout) {
      clearTimeout(seekTimeout);
      seekTimeout = null;
    }
  }

  function setHiddenVideoRef(el: unknown) {
    hiddenVideoRef.value = el as HTMLVideoElement | null;
  }

  onMounted(() => {
    const hv = hiddenVideoRef.value;
    if (hv) {
      hv.muted = true;
      hv.playsInline = true;
      hv.preload = 'auto';
      hv.crossOrigin = 'anonymous';
      hv.addEventListener('seeked', drawFrame);
      hv.addEventListener('loadedmetadata', drawFrame);
    }
  });

  onUnmounted(() => {
    if (seekTimeout) clearTimeout(seekTimeout);
    const hv = hiddenVideoRef.value;
    if (hv) {
      hv.removeEventListener('seeked', drawFrame);
      hv.removeEventListener('loadedmetadata', drawFrame);
      hv.pause();
      hv.removeAttribute('src');
      hv.load();
    }
  });

  return {
    setHiddenVideoRef,
    previewVisible,
    previewTime,
    previewDataUrl,
    previewLeft,
    previewTimeLabel: () => formatDuration(previewTime.value),
    onMouseMove,
    onMouseLeave
  };
}
