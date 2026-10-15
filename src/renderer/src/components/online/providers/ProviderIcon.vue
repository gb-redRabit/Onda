<script setup lang="ts">
import { computed } from 'vue';

// Prosta „ikona" providera: kolorowy kwadrat z literą. Bez oficjalnych logotypów
// (znaki towarowe) — spójny, rozpoznawalny znacznik obok nazwy.

const props = defineProps<{ providerId: string; label: string; size?: number }>();

const COLORS: Record<string, string> = {
  pikpak: '#7c5cff',
  mega: '#d9272e',
  gdrive: '#1a73e8',
  terabox: '#2b6cff',
  '123pan': '#f59e0b',
  dropbox: '#0061ff',
  yandex: '#fc3f1d',
  archive: '#111827',
  direct: '#64748b'
};

const size = computed(() => props.size ?? 18);
const letter = computed(() => (props.label.trim()[0] || '?').toUpperCase());
const color = computed(() => COLORS[props.providerId] || '#475569');
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white"
    :style="{
      backgroundColor: color,
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.55)}px`
    }"
    aria-hidden="true"
  >
    {{ letter }}
  </span>
</template>
