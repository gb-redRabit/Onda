<script setup lang="ts">
import { usePlayerStore } from '@renderer/stores/player';
import MediaCover from '@renderer/components/MediaCover.vue';

defineProps<{ size?: string }>();

const player = usePlayerStore();
</script>

<template>
  <div
    class="rounded-2xl bg-bg-overlay flex items-center justify-center overflow-hidden shrink-0"
    :class="size || 'w-96 h-96'"
  >
    <MediaCover
      v-if="player.currentTrack"
      :path="player.currentTrack.path"
      :size="48"
      :autoplay="true"
      fallback="music"
    />
    <MediaCover v-else :size="48" fallback="music" />
  </div>
</template>
