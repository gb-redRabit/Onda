<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { downsamplePeaks, waveformColor, waveformPlayedColor } from '@renderer/utils/waveform';

const props = defineProps<{
  path?: string | null;
  duration?: number;
  /** 0..1 — część fali do podświetlenia kolorem primary. */
  progress?: number;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const peaksCache = new Map<string, number[] | null>();
const pendingLoads = new Map<string, Promise<number[] | null>>();

let observer: ResizeObserver | null = null;
let frame = 0;
let peaks: number[] = [];

function loadPeaks(path: string, duration: number): Promise<number[] | null> {
  if (peaksCache.has(path)) return Promise.resolve(peaksCache.get(path) ?? null);
  const pending = pendingLoads.get(path);
  if (pending) return pending;
  const request = (window.api?.invoke('media:getWaveform', path, duration) ??
    Promise.resolve([])) as Promise<number[]>;
  const promise = request
    .then((result) => {
      const value = Array.isArray(result) && result.length > 0 ? result : null;
      peaksCache.set(path, value);
      return value;
    })
    .catch(() => null)
    .finally(() => pendingLoads.delete(path));
  pendingLoads.set(path, promise);
  return promise;
}

function draw(): void {
  const el = canvas.value;
  if (!el) return;
  const ctx = el.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = el.clientWidth;
  const ch = el.clientHeight;
  if (cw <= 0 || ch <= 0) return;
  const w = Math.round(cw * dpr);
  const h = Math.round(ch * dpr);
  if (el.width !== w || el.height !== h) {
    el.width = w;
    el.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (peaks.length === 0) return;

  const values = downsamplePeaks(peaks, Math.max(1, Math.floor(cw)));
  const barWidth = cw / values.length;
  const barW = Math.max(1, barWidth * 0.7);
  const minHeight = 1;

  const paint = (color: string, alpha: number): void => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < values.length; i++) {
      const barH = Math.max(minHeight, values[i] * ch * 0.9);
      ctx.fillRect(i * barWidth, (ch - barH) / 2, barW, barH);
    }
  };

  // Cała fala w kolorze neutralnym, a część odtwarzana przycięta do progressu.
  paint(waveformColor(), 0.25);
  const progress = Math.max(0, Math.min(1, props.progress ?? 0));
  if (progress > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw * progress, ch);
    ctx.clip();
    paint(waveformPlayedColor(), 0.9);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function scheduleDraw(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
}

async function refresh(): Promise<void> {
  const path = props.path;
  peaks = [];
  if (!path || path.startsWith('radio:')) {
    scheduleDraw();
    return;
  }
  const loaded = await loadPeaks(path, props.duration || 0);
  // Ścieżka mogła się zmienić w trakcie dekodowania.
  if (props.path !== path) return;
  peaks = loaded ?? [];
  scheduleDraw();
}

watch(
  () => [props.path, props.duration],
  () => {
    void refresh();
  }
);

// Progress zmienia się ~4×/s; samo przemalowanie jest tanie (bez ponownego dekodowania).
watch(
  () => props.progress,
  () => scheduleDraw()
);

onMounted(() => {
  if (canvas.value) {
    observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(canvas.value);
  }
  void refresh();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  if (frame) cancelAnimationFrame(frame);
});
</script>

<template>
  <canvas
    ref="canvas"
    data-testid="audio-waveform"
    class="block w-full h-full"
    aria-hidden="true"
  />
</template>
