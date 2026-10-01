<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

// Loader marki: radialny audio-wizualizator z ekranu startowego
// (resources/splash.html), wielokrotnego użytku dla dowolnego stanu ładowania treści. Kolor
// podąża za `--color-primary`, więc dostosowuje się do aktywnego motywu; fallback to
// firmowy fiolet splash.
const props = withDefaults(
  defineProps<{
    /** Pole canvas w pikselach CSS — słupki i promień skalują się z nim. */
    size?: number;
    /** Opcjonalny podpis pod animacją. */
    label?: string;
    /** Wypełnia i centruje wewnątrz rodzica zamiast dodawać pionowy padding. */
    overlay?: boolean;
  }>(),
  { size: 96, label: '', overlay: false }
);

const COUNT = 64;
const FALLBACK_RGB: [number, number, number] = [124, 106, 239];
const FRAME_MS = 0.016;

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;

function primaryRgb(el: HTMLElement): [number, number, number] {
  const raw = getComputedStyle(el).getPropertyValue('--color-primary').trim();
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return FALLBACK_RGB;
  const n = parseInt(raw.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

onMounted(() => {
  const el = canvas.value;
  const ctx = el?.getContext('2d');
  if (!el || !ctx) return;

  const s = props.size;
  const dpr = window.devicePixelRatio || 1;
  el.width = Math.round(s * dpr);
  el.height = Math.round(s * dpr);
  ctx.scale(dpr, dpr);

  const c = s / 2;
  const baseRadius = s * 0.2;
  const minBar = s * 0.025;
  const maxBar = s * 0.185;
  const lineWidth = Math.max(1, s * 0.017);
  const [r, g, b] = primaryRgb(el);

  const values = new Float32Array(COUNT);
  const target = new Float32Array(COUNT);
  let time = 0;

  const randomize = (): void => {
    for (let i = 0; i < COUNT; i++) {
      const freq = Math.sin(time * 1.8 + i * 0.3) * 0.5 + 0.5;
      const bass = i < COUNT / 4 ? Math.sin(time * 2.4) * 0.3 + 0.3 : 0;
      const mid = i > COUNT / 4 && i < COUNT / 2 ? Math.sin(time * 3.1 + 1) * 0.2 + 0.2 : 0;
      const treble = i > COUNT / 2 ? Math.sin(time * 4.5 + i * 0.15) * 0.15 + 0.1 : 0;
      target[i] = freq * 0.5 + bass + mid + treble;
    }
    if (Math.random() < 0.03) {
      const burst = Math.floor(Math.random() * COUNT);
      const range = 8 + Math.floor(Math.random() * 12);
      for (let j = 0; j < range; j++) {
        target[(burst + j) % COUNT] = 0.7 + Math.random() * 0.3;
      }
    }
  };

  const draw = (): void => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 - Math.PI / 2;
      const val = values[i];
      const len = val * maxBar + minBar;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(angle) * baseRadius, c + Math.sin(angle) * baseRadius);
      ctx.lineTo(
        c + Math.cos(angle) * (baseRadius + len),
        c + Math.sin(angle) * (baseRadius + len)
      );
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.25 + val * 0.75})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    const pulse = Math.sin(time * 2) * 0.15 + 0.85;
    ctx.beginPath();
    ctx.arc(c, c, baseRadius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, baseRadius * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
    ctx.lineWidth = Math.max(0.75, lineWidth * 0.75);
    ctx.stroke();
  };

  // Dostępność: pojedyncza statyczna klatka, gdy użytkownik preferuje ograniczony ruch.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    randomize();
    for (let i = 0; i < COUNT; i++) values[i] = target[i];
    draw();
    return;
  }

  const loop = (): void => {
    time += FRAME_MS;
    randomize();
    for (let i = 0; i < COUNT; i++) values[i] += (target[i] - values[i]) * 0.12;
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div
    role="status"
    :aria-label="label || undefined"
    class="flex flex-col items-center justify-center gap-2 text-base-content/50"
    :class="overlay ? 'w-full h-full min-h-32' : 'py-8'"
  >
    <canvas ref="canvas" aria-hidden="true" :style="{ width: `${size}px`, height: `${size}px` }" />
    <span v-if="label" class="text-xs">{{ label }}</span>
  </div>
</template>
