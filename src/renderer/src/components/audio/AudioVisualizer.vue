<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useSettingsStore } from '@renderer/stores/settings';
import type { VisualizationMode } from '@renderer/types/settings';
import { getFrequencyBins } from '@renderer/utils/audioViz';

const audio = useAudioPlayer();
const settings = useSettingsStore();
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
let dataArray: Uint8Array | null = null;
let lastFrameTime = 0;

// Crossfade state
let fadeAlpha = 1;
let prevStyle: VisualizationMode | null = null;
let fadeFrame: Uint8Array | null = null;

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

function draw(timestamp: number) {
  if (!canvasRef.value || !analyserNode) return;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d')!;
  const quality = getQuality();
  const rawDpr = window.devicePixelRatio;
  const dpr = Math.min(rawDpr, quality.dprCap);
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;

  if (w !== lastW || h !== lastH || dpr !== lastDpr) {
    canvas.width = w;
    canvas.height = h;
    ctx.scale(dpr, dpr);
    lastW = w;
    lastH = h;
    lastDpr = dpr;
  }

  const bufferLength = analyserNode.frequencyBinCount;
  if (!dataArray || dataArray.length !== bufferLength) {
    dataArray = new Uint8Array(bufferLength);
  }
  analyserNode.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);

  const fpsCap = settings.playback.visualization.fpsCap || 60;
  const frameInterval = 1000 / fpsCap;
  if (timestamp - lastFrameTime < frameInterval) {
    animFrame = requestAnimationFrame(draw);
    return;
  }
  lastFrameTime = timestamp;

  const cw = w / window.devicePixelRatio;
  const ch = h / window.devicePixelRatio;
  const prim = settings.playback.visualization.primaryColor || '#8b7cf0';
  const sec = settings.playback.visualization.secondaryColor || '#4f46e5';
  const sens = settings.playback.visualization.sensitivity || 0.5;

  // Smoothing: apply decay to dataArray
  const smoothing = settings.playback.visualization.smoothing ?? 0.8;
  if (fadeFrame && fadeFrame.length === bufferLength && smoothing > 0) {
    for (let i = 0; i < bufferLength; i++) {
      fadeFrame[i] = Math.max(
        dataArray[i],
        Math.round(fadeFrame[i] * smoothing)
      );
    }
    dataArray = new Uint8Array(fadeFrame);
  }
  fadeFrame = new Uint8Array(dataArray);

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
    drawBars(ctx, cw, ch, prim, sec, sens, dataArray, bufferLength, quality);
  } else if (style.value === 'spectrum') {
    drawSpectrum(ctx, cw, ch, prim, sec, sens, dataArray, bufferLength, quality);
  } else if (style.value === 'wave') {
    drawWave(ctx, cw, ch, prim, sens, dataArray, bufferLength);
  } else if (style.value === 'radial') {
    drawRadial(ctx, cw, ch, prim, sens, dataArray, bufferLength, quality);
  } else if (style.value === 'circle') {
    drawCircle(ctx, cw, ch, prim, sec, sens, dataArray, bufferLength, quality);
  } else if (style.value === 'rings') {
    drawRings(ctx, cw, ch, prim, sec, sens, dataArray, bufferLength);
  } else if (style.value === 'particles') {
    drawParticles(ctx, cw, ch, prim, sec, sens, dataArray, bufferLength, quality);
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
  _data: Uint8Array,
  _bufferLength: number,
  quality: { barCount: number }
) {
  const barCount = quality.barCount;
  const gap = 2;
  const barWidth = cw / barCount - gap;
  const bins = getFrequencyBins(analyserNode, barCount);
  const gradient = ctx.createLinearGradient(0, 0, 0, ch);
  gradient.addColorStop(0, prim);
  gradient.addColorStop(1, sec);
  ctx.fillStyle = gradient;
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
  _data: Uint8Array,
  _bufferLength: number,
  quality: { barCount: number }
) {
  const barCount = quality.barCount;
  const gap = 2;
  const barWidth = cw / barCount - gap;
  const bins = getFrequencyBins(analyserNode, barCount);
  const gradient = ctx.createLinearGradient(0, 0, cw, 0);
  gradient.addColorStop(0, sec);
  gradient.addColorStop(0.5, prim);
  gradient.addColorStop(1, sec);
  ctx.fillStyle = gradient;
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
  _sens: number,
  data: Uint8Array,
  bufferLength: number
) {
  analyserNode!.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
  ctx.lineWidth = 2;
  ctx.strokeStyle = prim;
  ctx.beginPath();
  const sliceWidth = cw / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = data[i] / 128.0;
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
  _sec: string,
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
  _sec: string,
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
  } else if (audio.isPlaying.value && !animFrame) {
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
  if (audio.isPlaying.value) {
    animFrame = requestAnimationFrame(draw);
  }
});

watch(
  () => audio.isPlaying.value,
  (playing) => {
    if (playing && !document.hidden) {
      lastFrameTime = 0;
      animFrame = requestAnimationFrame(draw);
    } else if (animFrame) {
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
      v-if="!audio.isPlaying.value && style !== 'none'"
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
