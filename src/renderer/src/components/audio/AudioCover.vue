<script setup lang="ts">
import { usePlayerStore } from '@renderer/stores/player';
import { Music2 } from '@lucide/vue';

defineProps<{ size?: string }>();

const player = usePlayerStore();
</script>

<template>
  <div
    class="rounded-2xl bg-bg-overlay flex items-center justify-center overflow-hidden shrink-0"
    :class="size || 'w-96 h-96'"
  >
    <template v-if="player.currentTrack">
      <video
        v-if="player.getCover(player.currentTrack.path).type === 'video'"
        :src="'file:///' + player.getCover(player.currentTrack.path).data"
        class="w-full h-full object-cover"
        muted
        loop
        autoplay
      />
      <img
        v-else-if="player.getCover(player.currentTrack.path).type === 'image'"
        :src="player.getCover(player.currentTrack.path).data || ''"
        class="w-full h-full object-cover"
      />
      <Music2 v-else :size="48" class="text-accent-base" />
    </template>
    <Music2 v-else :size="48" class="text-fg-faint" />
  </div>
</template>
