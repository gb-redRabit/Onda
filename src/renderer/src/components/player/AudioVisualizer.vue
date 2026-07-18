<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useMediaPlayer } from '@renderer/composables/useMediaPlayer';

const player = usePlayerStore();
const { analyserNode } = useMediaPlayer();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const style = ref<'bars' | 'wave' | 'radial'>('bars');
let animFrame: number | null = null;

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

  ctx.clearRect(0, 0, w, h);

  if (style.value === 'bars') {
    const barCount = 64;
    const barWidth = w / window.devicePixelRatio / barCount - 2;
    for (let i = 0; i < barCount; i++) {
      const val = dataArray[Math.floor((i * bufferLength) / barCount)] / 255;
      const barH = val * (h / window.devicePixelRatio);
      const x = i * (barWidth + 2);
      const y = h / window.devicePixelRatio - barH;

      const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
      gradient.addColorStop(0, '#7c6aef');
      gradient.addColorStop(1, '#3b82f6');
      ctx.fillStyle = gradient;
      ctx.roundRect(x, y, barWidth, barH, 2);
      ctx.fill();
    }
  } else if (style.value === 'wave') {
    analyserNode.getByteTimeDomainData(dataArray);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#7c6aef';
    ctx.beginPath();
    const sliceWidth = w / window.devicePixelRatio / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * (h / window.devicePixelRatio)) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  } else if (style.value === 'radial') {
    const cx = w / window.devicePixelRatio / 2;
    const cy = h / window.devicePixelRatio / 2;
    const radius = Math.min(cx, cy) * 0.4;
    const count = 128;
    for (let i = 0; i < count; i++) {
      const val = dataArray[Math.floor((i * bufferLength) / count)] / 255;
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const len = val * radius * 1.5 + 4;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + len);
      const y2 = cy + Math.sin(angle) * (radius + len);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(124, 106, 239, ${0.4 + val * 0.6})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  animFrame = requestAnimationFrame(draw);
}

function cycleStyle() {
  const styles: Array<'bars' | 'wave' | 'radial'> = ['bars', 'wave', 'radial'];
  const idx = styles.indexOf(style.value);
  style.value = styles[(idx + 1) % styles.length];
}

onMounted(() => {
  if (player.isPlaying) draw();
});

watch(
  () => player.isPlaying,
  (playing) => {
    if (playing) draw();
    else if (animFrame) cancelAnimationFrame(animFrame);
  }
);

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame);
});
</script>

<template>
  <div
    class="relative w-full h-full bg-bg-overlay rounded-xl overflow-hidden cursor-pointer group"
    @click="cycleStyle"
  >
    <canvas ref="canvasRef" class="w-full h-full" />
    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <span class="px-2 py-1 rounded-lg bg-black/60 text-white text-[10px] uppercase font-medium">{{
        style
      }}</span>
    </div>
    <div
      v-if="!player.isPlaying"
      class="absolute inset-0 flex items-center justify-center bg-black/20"
    >
      <span class="text-fg-faint text-xs">Kliknij aby odtworzyć</span>
    </div>
  </div>
</template>
