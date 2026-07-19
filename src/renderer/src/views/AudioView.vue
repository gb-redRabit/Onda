<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { audioEngine } from '@renderer/modules/audioEngine';
import { moduleManager } from '@renderer/modules/ModuleManager';

const player = usePlayerStore();
const audio = useAudioPlayer();

onMounted(() => {
  moduleManager.switchTo('player');
  if (player.currentTrack?.type === 'audio') {
    audioEngine.loadTrack(player.currentTrack);
    setTimeout(() => {
      if (audio.isPlaying.value) audioEngine.play();
    }, 100);
    player.flushPendingQueue();
  }
});

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
