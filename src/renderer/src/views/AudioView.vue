<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';

const player = usePlayerStore();

const title = computed(
  () => player.currentTrack?.metadata?.title || player.currentTrack?.name || 'Brak utworu'
);
const artist = computed(() => player.currentTrack?.metadata?.artist || '');
</script>

<template>
  <div class="flex flex-col h-full items-center justify-center bg-bg-base select-none">
    <div class="text-center px-8 max-w-full">
      <p class="text-2xl font-semibold text-fg-base truncate">{{ title }}</p>
      <p v-if="artist" class="text-base text-fg-muted mt-1 truncate">{{ artist }}</p>
      <p v-else class="text-sm text-fg-faint mt-2">Odtwarzacz audio</p>
    </div>
  </div>
</template>
