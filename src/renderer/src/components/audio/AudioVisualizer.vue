<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import type { VisualizationMode } from '@renderer/types/settings';
import { VIZ_CYCLES } from '@renderer/utils/audioVisualizer';
import { drawRadial, drawCircle } from '@renderer/utils/visualizerDraw';
import { binFreq } from '@renderer/utils/visualizerBins';
import { barGradient, spectrumGradient, resetGradients } from '@renderer/utils/visualizerGradients';
import { getFreqData, smoothData, getWaveData } from '@renderer/utils/visualizerBuffers';
import { useVizConfig } from '@renderer/composables/useVizConfig';

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

// Crossfade state
let fadeAlpha = 1;
let prevStyle: VisualizationMode | null = null;

const CYCLES: VisualizationMode[] = VIZ_CYCLES;

const { vizCfg, quality } = useVizConfig();

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
    resetGradients();
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
  const drawData = smoothData(
    getFreqData(analyserNode, bufferLength),
    vizCfg.smoothing,
    bufferLength
  );

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
  const bins = binFreq(analyserNode!.frequencyBinCount, data, barCount);
  ctx.fillStyle = barGradient(ctx, ch, prim, sec);
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
  const bins = binFreq(analyserNode!.frequencyBinCount, data, barCount);
  ctx.fillStyle = spectrumGradient(ctx, cw, prim, sec);
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
  const wave = getWaveData(analyserNode!, bufferLength);
  ctx.lineWidth = 2;
  ctx.strokeStyle = prim;
  ctx.beginPath();
  const sliceWidth = cw / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = wave[i] / 128.0;
    const y = (v * ch) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.stroke();
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
    if (
      m !== 'none' &&
      prev === 'none' &&
      audio.isPlaying.value &&
      !document.hidden &&
      !animFrame
    ) {
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
      <span class="text-base-content/40 text-[11px]">{{ $t('audioView.noTrackHint') }}</span>
    </div>
  </div>
</template>
