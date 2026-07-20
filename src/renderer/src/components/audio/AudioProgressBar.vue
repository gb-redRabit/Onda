<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { formatDuration } from '@renderer/utils/formatters';

const player = usePlayerStore();
const audio = useAudioPlayer();

const progressPct = computed(() =>
  audio.duration.value > 0 ? (audio.currentTime.value / audio.duration.value) * 100 : 0
);

function onSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.seek(pct * audio.duration.value);
}

function onDragSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  function update(ev: MouseEvent) {
    const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    audio.seek(pct * audio.duration.value);
  }
  update(e);
  function onMove(ev: MouseEvent) {
    update(ev);
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<template>
  <div class="w-full flex items-center gap-3">
    <span class="text-xs text-fg-muted font-mono tabular-nums w-10 text-right shrink-0">
      {{ formatDuration(audio.currentTime.value) }}
    </span>
    <div
      class="flex-1 h-1.5 bg-bg-active rounded-full cursor-pointer hover:h-2 transition-all group relative"
      @click="onSeek"
      @mousedown="onDragSeek"
    >
      <div
        class="h-full bg-accent-base rounded-full relative"
        :style="{ width: progressPct + '%' }"
      >
        <div
          class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent-base shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
    <span class="text-xs text-fg-faint font-mono tabular-nums w-10 shrink-0">
      {{ formatDuration(audio.duration.value) }}
    </span>
  </div>
</template>
