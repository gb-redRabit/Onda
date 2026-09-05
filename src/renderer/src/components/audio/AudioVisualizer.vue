<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import type { VisualizationMode } from '@renderer/types/settings';

const audio = useAudioPlayer();
const settings = useSettingsStore();
const player = usePlayerStore();
const { analyserNode } = audio;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const style = ref<VisualizationMode>(settings.playback.visualization.mode);
let animFrame: number | null = null;

const particles = ref<
  { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[]
>([]);

let lastW = 0;
let lastH = 0;
let lastDpr = 0;
let lastFrameTime = 0;
let nonePainted = false;

// Analyser scratch buffers (no per-frame allocation)
let freqData: Uint8Array | null = null;
let smoothPrev: Uint8Array | null = null;
let smoothOut: Uint8Array | null = null;
let waveBuf: Uint8Array | null = null;
let binScratch: number[] = [];

// Gradient cache
let barGrad: CanvasGradient | null = null;
let barGradH = 0;
let barGradPrim = '';
let barGradSec = '';
let spectGrad: CanvasGradient | null = null;
let spectGradW = 0;
let spectGradPrim = '';
let spectGradSec = '';

// Crossfade state
let fadeAlpha = 1;
let prevStyle: VisualizationMode | null = null;

const CYCLES: VisualizationMode[] = [
  'bars',
  'spectrum',
  'wave',
  'radial',
  'rings',
  'circle',
  'particles',
  'none'
];

const QUALITY_PRESETS = {
  low: { dprCap: 1, barCount: 32, radialCount: 64, circleCount: 90, particleCount: 30 },
  medium: { dprCap: 1.5, barCount: 48, radialCount: 96, circleCount: 135, particleCount: 55 },
  high: { dprCap: 2, barCount: 64, radialCount: 128, circleCount: 180, particleCount: 80 }
} as const;

function getQuality() {
  const q = settings.appearance.audioLayout?.vizQuality ?? 'high';
  return QUALITY_PRESETS[q];
}

// Cached viz settings (avoid touching the Pinia proxy every frame)
const vizCfg = reactive({
  fpsCap: (settings.playback.visualization.fpsCap as number) || 60,
  primaryColor: settings.playback.visualization.primaryColor || '#8b7cf0',
  secondaryColor: settings.playback.visualization.secondaryColor || '#4f46e5',
  sensitivity: settings.playback.visualization.sensitivity || 0.5,
  smoothing: settings.playback.visualization.smoothing ?? 0.8
});

const quality = ref(getQuality());

watch(
  () => settings.playback.visualization,
  (v) => {
    vizCfg.fpsCap = v.fpsCap || 60;
    vizCfg.primaryColor = v.primaryColor || '#8b7cf0';
    vizCfg.secondaryColor = v.secondaryColor || '#4f46e5';
    vizCfg.sensitivity = v.sensitivity || 0.5;
    vizCfg.smoothing = v.smoothing ?? 0.8;
  },
  { deep: true }
);

watch(
  () => settings.appearance.audioLayout?.vizQuality,
  () => {
    quality.value = getQuality();
  }
);

function binFreq(data: Uint8Array, count: number): number[] {
  const len = analyserNode!.frequencyBinCount;
  const binSize = Math.floor(len / count);
  if (binScratch.length !== count) binScratch = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = i * binSize;
    const end = Math.min(start + binSize, len);
    for (let j = start; j < end; j++) sum += data[j];
    binScratch[i] = Math.round(sum / (end - start));
  }
  return binScratch;
}

function draw(timestamp: number) {
  if (!canvasRef.value || !analyserNode) return;
  const canvas = canvasRef.value;

  const frameInterval = 1000 / (vizCfg.fpsCap || 60);
  if (timestamp - lastFrameTime < frameInterval) {
    animFrame = requestAnimationFrame(draw);
    return;
  }
  lastFrameTime = timestamp;

  const ctx = canvas.getContext('2d')!;
  const rawDpr = window.devicePixelRatio;
  const dpr = Math.min(rawDpr, quality.value.dprCap);
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;

  if (w !== lastW || h !== lastH || dpr !== lastDpr) {
    canvas.width = w;
    canvas.height = h;
    ctx.scale(dpr, dpr);
    lastW = w;
    lastH = h;
    lastDpr = dpr;
    barGrad = null;
    spectGrad = null;
  }

  const cw = w / rawDpr;
  const ch = h / rawDpr;

  if (style.value === 'none') {
    if (!nonePainted) {
      ctx.clearRect(0, 0, cw, ch);
      nonePainted = true;
    }
    animFrame = null;
    return;
  }
  nonePainted = false;

  const bufferLength = analyserNode.frequencyBinCount;
  if (!freqData || freqData.length !== bufferLength) freqData = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(freqData);

  let drawData = freqData;
  if (vizCfg.smoothing > 0) {
    if (!smoothPrev || smoothPrev.length !== bufferLength) smoothPrev = new Uint8Array(bufferLength);
    if (!smoothOut || smoothOut.length !== bufferLength) smoothOut = new Uint8Array(bufferLength);
    const prev = smoothPrev;
    const out = smoothOut;
    for (let i = 0; i < bufferLength; i++) {
      out[i] = Math.max(freqData[i], Math.round(prev[i] * vizCfg.smoothing));
    }
    drawData = out;
    // ping-pong: the just-computed buffer becomes the baseline for the next frame
    smoothPrev = out;
    smoothOut = prev;
  }

  const prim = vizCfg.primaryColor;
  const sec = vizCfg.secondaryColor;
  const sens = vizCfg.sensitivity;

  ctx.clearRect(0, 0, cw, ch);

  // Crossfade alpha when switching modes
  if (prevStyle !== null && prevStyle !== style.value) {
    fadeAlpha -= 0.08;
    if (fadeAlpha <= 0) {
      fadeAlpha = 1;
      prevStyle = null;
    }
  }
  const alpha = prevStyle !== null ? fadeAlpha : 1;

  ctx.globalAlpha = alpha;

  if (style.value === 'bars') {
    drawBars(ctx, cw, ch, prim, sec, sens, drawData, quality.value);
  } else if (style.value === 'spectrum') {
    drawSpectrum(ctx, cw, ch, prim, sec, sens, drawData, quality.value);
  } else if (style.value === 'wave') {
    drawWave(ctx, cw, ch, prim, bufferLength);
  } else if (style.value === 'radial') {
    drawRadial(ctx, cw, ch, prim, sens, drawData, bufferLength, quality.value);
  } else if (style.value === 'circle') {
    drawCircle(ctx, cw, ch, prim, sens, drawData, bufferLength, quality.value);
  } else if (style.value === 'rings') {
    drawRings(ctx, cw, ch, prim, sec, sens, drawData, bufferLength);
  } else if (style.value === 'particles') {
    drawParticles(ctx, cw, ch, prim, sens, drawData, bufferLength, quality.value);
  }

  ctx.globalAlpha = 1;

  animFrame = requestAnimationFrame(draw);
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sec: string,
  sens: number,
  data: Uint8Array,
  quality: { barCount: number }
) {
  const barCount = quality.barCount;
  const gap = 2;
  const barWidth = cw / barCount - gap;
  const bins = binFreq(data, barCount);
  if (!barGrad || barGradH !== ch || barGradPrim !== prim || barGradSec !== sec) {
    barGrad = ctx.createLinearGradient(0, 0, 0, ch);
    barGrad.addColorStop(0, prim);
    barGrad.addColorStop(1, sec);
    barGradH = ch;
    barGradPrim = prim;
    barGradSec = sec;
  }
  ctx.fillStyle = barGrad;
  for (let i = 0; i < barCount; i++) {
    const val = bins[i] / 255;
    const barH = val * ch * sens;
    ctx.fillRect(i * (barWidth + gap), ch - barH, barWidth, barH);
  }
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sec: string,
  sens: number,
  data: Uint8Array,
  quality: { barCount: number }
) {
  const barCount = quality.barCount;
  const gap = 2;
  const barWidth = cw / barCount - gap;
  const bins = binFreq(data, barCount);
  if (!spectGrad || spectGradW !== cw || spectGradPrim !== prim || spectGradSec !== sec) {
    spectGrad = ctx.createLinearGradient(0, 0, cw, 0);
    spectGrad.addColorStop(0, sec);
    spectGrad.addColorStop(0.5, prim);
    spectGrad.addColorStop(1, sec);
    spectGradW = cw;
    spectGradPrim = prim;
    spectGradSec = sec;
  }
  ctx.fillStyle = spectGrad;
  const centerY = ch / 2;
  for (let i = 0; i < barCount; i++) {
    const val = bins[i] / 255;
    const barH = (val * ch * sens) / 2;
    const x = i * (barWidth + gap);
    ctx.fillRect(x, centerY - barH, barWidth, barH);
    ctx.fillRect(x, centerY, barWidth, barH);
  }
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  bufferLength: number
) {
  if (!waveBuf || waveBuf.length !== bufferLength) waveBuf = new Uint8Array(bufferLength);
  analyserNode!.getByteTimeDomainData(waveBuf);
  ctx.lineWidth = 2;
  ctx.strokeStyle = prim;
  ctx.beginPath();
  const sliceWidth = cw / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = waveBuf[i] / 128.0;
    const y = (v * ch) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
}

function drawRadial(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number,
  quality: { radialCount: number }
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const radius = Math.min(cx, cy) * 0.4;
  const count = quality.radialCount;
  ctx.lineWidth = 2;
  ctx.strokeStyle = prim;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const val = data[Math.floor((i * bufferLength) / count)] / 255;
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const len = val * radius * 1.5 * sens + 4;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + len);
    const y2 = cy + Math.sin(angle) * (radius + len);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number,
  quality: { circleCount: number }
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const baseR = Math.min(cx, cy) * 0.35;
  const count = quality.circleCount;
  const avg = data.reduce((a, b) => a + b, 0) / bufferLength / 255;
  const pulse = 1 + avg * 0.3 * sens;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const val = data[Math.floor((i * bufferLength) / count)] / 255;
    const angle = (i / count) * Math.PI * 2;
    const r = baseR * pulse + val * baseR * 0.6 * sens;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const radius = Math.max(1.5, val * 4);
    ctx.moveTo(x + radius, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = prim;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawRings(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sec: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const maxRadius = Math.min(cx, cy) * 0.85;
  const ringCount = 6;
  const binSize = Math.floor(bufferLength / ringCount);
  for (let r = 0; r < ringCount; r++) {
    const start = r * binSize;
    const end = Math.min(start + binSize, bufferLength);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    const val = sum / (end - start) / 255;
    const radius = (maxRadius / ringCount) * (r + 1);
    const lineWidth = 2 + val * 4 * sens;
    const progress = r / ringCount;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = progress < 0.5 ? prim : sec;
    ctx.globalAlpha = 0.3 + val * 0.7;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  prim: string,
  sens: number,
  data: Uint8Array,
  bufferLength: number,
  quality: { particleCount: number }
) {
  const count = quality.particleCount;
  if (particles.value.length === 0) {
    for (let i = 0; i < count; i++) {
      particles.value.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 3 + 1,
        alpha: Math.random() * 0.5 + 0.3
      });
    }
  } else if (particles.value.length > count) {
    particles.value.length = count;
  } else if (particles.value.length < count) {
    while (particles.value.length < count) {
      particles.value.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 3 + 1,
        alpha: Math.random() * 0.5 + 0.3
      });
    }
  }
  const avg = data.reduce((a, b) => a + b, 0) / bufferLength / 255;
  const speed = 1 + avg * 2 * sens;
  ctx.beginPath();
  for (const p of particles.value) {
    p.x += p.vx * speed;
    p.y += p.vy * speed;
    if (p.x < 0) p.x = cw;
    if (p.x > cw) p.x = 0;
    if (p.y < 0) p.y = ch;
    if (p.y > ch) p.y = 0;
    const fi = Math.floor(Math.random() * bufferLength);
    const fv = data[fi] / 255;
    const r = p.size + fv * 3 * sens;
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = prim;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function onVisibilityChange() {
  if (document.hidden) {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  } else if (audio.isPlaying.value && !animFrame && style.value !== 'none') {
    lastFrameTime = 0;
    animFrame = requestAnimationFrame(draw);
  }
}

function cycleStyle() {
  const idx = CYCLES.indexOf(style.value);
  prevStyle = style.value;
  fadeAlpha = 1;
  style.value = CYCLES[(idx + 1) % CYCLES.length];
  settings.updatePlayback({
    visualization: { ...settings.playback.visualization, mode: style.value }
  });
}

watch(
  () => settings.playback.visualization.mode,
  (m) => {
    if (m !== style.value) {
      prevStyle = style.value;
      fadeAlpha = 1;
      style.value = m;
    }
  }
);

watch(
  () => style.value,
  (m, prev) => {
    if (m !== 'none' && prev === 'none' && audio.isPlaying.value && !document.hidden && !animFrame) {
      lastFrameTime = 0;
      animFrame = requestAnimationFrame(draw);
    }
  }
);

// Apply smoothing to AnalyserNode
watch(
  () => settings.playback.visualization.smoothing,
  (s) => {
    if (analyserNode) analyserNode.smoothingTimeConstant = s ?? 0.8;
  },
  { immediate: true }
);

onMounted(() => {
  if (analyserNode) {
    analyserNode.smoothingTimeConstant = settings.playback.visualization.smoothing ?? 0.8;
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (audio.isPlaying.value && style.value !== 'none') {
    animFrame = requestAnimationFrame(draw);
  }
});

watch(
  () => audio.isPlaying.value,
  (playing) => {
    if (playing && !document.hidden && !animFrame && style.value !== 'none') {
      lastFrameTime = 0;
      animFrame = requestAnimationFrame(draw);
    } else if (!playing && animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  }
);

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (animFrame) cancelAnimationFrame(animFrame);
});

defineExpose({ style, cycleStyle });
</script>

<template>
  <div
    class="relative w-full h-full bg-neutral overflow-hidden cursor-pointer group"
    @click="cycleStyle"
  >
    <canvas ref="canvasRef" class="w-full h-full" />
    <div
      v-if="!player.currentTrack && !audio.isPlaying.value && style !== 'none'"
      class="absolute inset-0 flex flex-col items-center justify-center bg-neutral/20 gap-2"
    >
      <span class="text-base-content/70 text-sm font-medium">{{
        $t('audioView.noTrackTitle')
      }}</span>
      <span class="text-base-content/40 text-[11px]">{{
        $t('audioView.noTrackHint')
      }}</span>
    </div>
  </div>
</template>