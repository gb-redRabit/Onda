<script setup lang="ts">
import { computed } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';

const audio = useAudioPlayer();
const player = usePlayerStore();

const isLive = computed(
  () =>
    player.currentTrack?.type === 'stream' &&
    !!player.currentTrack?.id.startsWith('radio:') &&
    !player.currentTrack?.duration
);

const progressPct = computed(() =>
  audio.duration.value > 0 ? (audio.currentTime.value / audio.duration.value) * 100 : 0
);

const bufferedPct = computed(() => audio.buffered.value * 100);

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
  <div v-if="isLive" class="w-full flex items-center gap-3">
    <span class="text-xs font-bold tracking-widest text-red-base">{{ $t('player.live') }}</span>
    <div class="flex-1 h-px bg-bg-active rounded-full" />
  </div>
  <div v-else class="w-full flex items-center gap-3">
    <span class="text-xs text-fg-muted font-mono tabular-nums w-10 text-right shrink-0">
      {{ formatDuration(audio.currentTime.value) }}
    </span>
    <div
      class="flex-1 h-1 bg-bg-active rounded-full cursor-pointer hover:h-1.5 transition-[height] group relative"
      @click="onSeek"
      @mousedown="onDragSeek"
    >
      <div
        class="absolute inset-y-0 left-0 bg-accent-base/50 rounded-full"
        :style="{ width: bufferedPct + '%' }"
      />
      <div
        class="absolute inset-y-0 left-0 bg-accent-base rounded-full "
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
