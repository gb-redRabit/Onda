<script setup lang="ts">
import { Subtitles } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';

const player = usePlayerStore();
</script>

<template>
  <button
    data-testid="subtitle-button"
    class="text-neutral-content/60 hover:text-neutral-content/80 transition-colors"
    :class="{ 'text-primary-text!': player.subtitlePanelVisible || !!player.activeSubtitleId }"
    :aria-label="$t('player.subtitles')"
    :aria-expanded="player.subtitlePanelVisible"
    @click="player.toggleSubtitlePanel"
  >
    <Subtitles :size="16" />
  </button>
</template>
