import { ref, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { formatDuration } from '@renderer/utils/formatters';

interface PreviewRefs {
  videoRef: Ref<HTMLVideoElement | null>;
  progressRef: Ref<HTMLDivElement | null>;
}

const PREVIEW_WIDTH = 160;
const PREVIEW_HEIGHT = 90;
const SEEK_DEBOUNCE_MS = 80;

export function usePipVideoPreview(refs: PreviewRefs) {
  const { videoRef, progressRef } = refs;

  const hiddenVideoRef = ref<HTMLVideoElement | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const previewVisible = ref(false);
  const previewTime = ref(0);
  const previewDataUrl = ref<string | null>(null);
  const previewLeft = ref(0);

  let seekTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastSrc = '';

  function getCanvas(): HTMLCanvasElement {
    if (canvasRef.value) return canvasRef.value;
    const canvas = document.createElement('canvas');
    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    canvasRef.value = canvas;
    return canvas;
  }

  function drawFrame() {
    const hv = hiddenVideoRef.value;
    if (!hv || hv.readyState < 2) return;
    const canvas = getCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(hv, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      previewDataUrl.value = canvas.toDataURL('image/jpeg', 0.85);
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

  function handleMouseMove(e: MouseEvent) {
    const bar = progressRef.value;
    const v = videoRef.value;
    if (!bar || !v || !Number.isFinite(v.duration)) return;

    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = rect.width > 0 ? x / rect.width : 0;
    const time = pct * v.duration;

    previewVisible.value = true;
    previewTime.value = time;
    previewLeft.value = Math.max(0, Math.min(pct * 100, 100));

    if (seekTimeout) clearTimeout(seekTimeout);
    seekTimeout = setTimeout(() => seekTo(time), SEEK_DEBOUNCE_MS);
  }

  function handleMouseLeave() {
    previewVisible.value = false;
    if (seekTimeout) {
      clearTimeout(seekTimeout);
      seekTimeout = null;
    }
  }

  function handleLoadedMetadata() {
    drawFrame();
  }

  onMounted(() => {
    const hv = hiddenVideoRef.value;
    if (hv) {
      hv.muted = true;
      hv.playsInline = true;
      hv.preload = 'auto';
      hv.crossOrigin = 'anonymous';
      hv.addEventListener('seeked', drawFrame);
      hv.addEventListener('loadedmetadata', handleLoadedMetadata);
    }
  });

  onUnmounted(() => {
    if (seekTimeout) clearTimeout(seekTimeout);
    const hv = hiddenVideoRef.value;
    if (hv) {
      hv.removeEventListener('seeked', drawFrame);
      hv.removeEventListener('loadedmetadata', handleLoadedMetadata);
      hv.pause();
      hv.removeAttribute('src');
      hv.load();
    }
  });

  return {
    setHiddenVideoRef: (el: unknown) => {
      hiddenVideoRef.value = el as HTMLVideoElement | null;
    },
    previewVisible,
    previewTime,
    previewDataUrl,
    previewLeft,
    previewTimeLabel: () => formatDuration(previewTime.value),
    handleMouseMove,
    handleMouseLeave
  };
}
