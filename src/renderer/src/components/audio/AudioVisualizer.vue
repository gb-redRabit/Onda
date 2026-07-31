<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useSettingsStore } from '@renderer/stores/settings';
import type { VisualizationMode } from '@renderer/types/settings';

const audio = useAudioPlayer();
const settings = useSettingsStore();
const { analyserNode } = audio;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const style = ref<VisualizationMode>(settings.playback.visualization.mode);
let animFrame: number | null = null;

const particles = ref<
  { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[]
>([]);

function draw() {
  if (!canvasRef.value || !analyserNode) return;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d')!;
  const w = (canvas.width = canvas.clientWidth * window.devicePixelRatio);
  const h = (canvas.height = canvas.clientHeight * window.devicePixelRatio);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  const cw = w / window.devicePixelRatio;
  const ch = h / window.devicePixelRatio;
  const prim = settings.playback.visualization.primaryColor || '#7c6aef';
  const sec = settings.playback.visualization.secondaryColor || '#4f46e5';
  const sens = settings.playback.visualization.sensitivity || 0.5;

  ctx.clearRect(0, 0, cw, ch);

  if (style.value === 'circle') {
    const cx = cw / 2;
    const cy = ch / 2;
    const baseR = Math.min(cx, cy) * 0.35;
    const count = 180;
    const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
    const pulse = 1 + avg * 0.3 * sens;
    for (let i = 0; i < count; i++) {
      const val = dataArray[Math.floor((i * bufferLength) / count)] / 255;
      const angle = (i / count) * Math.PI * 2;
      const r = baseR * pulse + val * baseR * 0.6 * sens;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5, val * 4), 0, Math.PI * 2);
      ctx.fillStyle = val > 0.5 ? prim : sec;
      ctx.globalAlpha = 0.3 + val * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (style.value === 'bars') {
    const barCount = 64;
    const barWidth = cw / barCount - 2;
    for (let i = 0; i < barCount; i++) {
      const val = dataArray[Math.floor((i * bufferLength) / barCount)] / 255;
      const barH = val * ch * sens;
      const x = i * (barWidth + 2);
      const y = ch - barH;
      const gradient = ctx.createLinearGradient(0, y, 0, ch);
      gradient.addColorStop(0, prim);
      gradient.addColorStop(1, sec);
      ctx.fillStyle = gradient;
      ctx.roundRect(x, y, barWidth, barH, 2);
      ctx.fill();
    }
  } else if (style.value === 'wave') {
    analyserNode.getByteTimeDomainData(dataArray);
    ctx.lineWidth = 2;
    ctx.strokeStyle = prim;
    ctx.beginPath();
    const sliceWidth = cw / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * ch) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  } else if (style.value === 'particles') {
    const count = 80;
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
    }
    for (const p of particles.value) {
      const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
      const speed = 1 + avg * 2 * sens;
      p.x += p.vx * speed;
      p.y += p.vy * speed;
      if (p.x < 0) p.x = cw;
      if (p.x > cw) p.x = 0;
      if (p.y < 0) p.y = ch;
      if (p.y > ch) p.y = 0;
      const fi = Math.floor(Math.random() * bufferLength);
      const fv = dataArray[fi] / 255;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + fv * 3 * sens, 0, Math.PI * 2);
      ctx.fillStyle = fv > 0.5 ? prim : sec;
      ctx.globalAlpha = p.alpha + fv * 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (style.value === 'radial') {
    const cx = cw / 2;
    const cy = ch / 2;
    const radius = Math.min(cx, cy) * 0.4;
    const count = 128;
    for (let i = 0; i < count; i++) {
      const val = dataArray[Math.floor((i * bufferLength) / count)] / 255;
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const len = val * radius * 1.5 * sens + 4;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + len);
      const y2 = cy + Math.sin(angle) * (radius + len);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = val > 0.5 ? prim : sec;
      ctx.globalAlpha = 0.4 + val * 0.6;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  animFrame = requestAnimationFrame(draw);
}

const CYCLES: VisualizationMode[] = ['circle', 'bars', 'wave', 'particles', 'radial'];

function cycleStyle() {
  const idx = CYCLES.indexOf(style.value);
  style.value = CYCLES[(idx + 1) % CYCLES.length];
  settings.updatePlayback({
    visualization: { ...settings.playback.visualization, mode: style.value }
  });
}

watch(
  () => settings.playback.visualization.mode,
  (m) => {
    style.value = m;
  }
);

onMounted(() => {
  if (audio.isPlaying.value) draw();
});

watch(
  () => audio.isPlaying.value,
  (playing) => {
    if (playing) draw();
    else if (animFrame) cancelAnimationFrame(animFrame);
  }
);

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame);
});

defineExpose({ style, cycleStyle });
</script>

<template>
  <div
    class="relative w-full h-full bg-bg-overlay overflow-hidden cursor-pointer group"
    @click="cycleStyle"
  >
    <canvas ref="canvasRef" class="w-full h-full" />
    <div
      v-if="!audio.isPlaying.value"
      class="absolute inset-0 flex items-center justify-center bg-black/20"
    >
      <span class="text-fg-faint text-xs">{{ $t('audioView.vizMode') }}</span>
    </div>
  </div>
</template>
