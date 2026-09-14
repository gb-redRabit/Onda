<script setup lang="ts">
import { usePlayerStore } from '@renderer/stores/player';
import { ListMusic, Music2 } from '@lucide/vue';

const player = usePlayerStore();
</script>

<template>
  <div
    v-if="player.queueLength > 0"
    class="mx-2 mb-1 p-3 rounded-box fx-noise bg-base-200 border border-base-content/20"
  >
    <div
      class="flex items-center gap-2 text-[11px] text-base-content/50 mb-2 font-medium uppercase tracking-wider"
    >
      <ListMusic :size="12" />
      <span>{{ $t('nav.queue') }}</span>
      <span class="ml-auto text-base-content/70">{{ player.queueLength }}</span>
    </div>
    <div class="space-y-0.5 max-h-28 overflow-auto">
      <div
        v-for="(track, i) in player.displayQueue.slice(0, 5)"
        :key="i"
        class="flex items-center gap-2 text-xs text-base-content/70 truncate px-2 py-1.5 rounded-field hover:bg-base-content/10 hover:text-base-content transition-colors"
      >
        <Music2 :size="11" class="shrink-0 text-primary" />
        <span class="truncate">{{ track.metadata?.title || track.name }}</span>
      </div>
    </div>
  </div>
</template>
