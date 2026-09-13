<script setup lang="ts">
import { Pause, Play } from '@lucide/vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { PLAY_BOX, PLAY_SIZE } from '@renderer/utils/audioControls';

const audio = useAudioPlayer();

function togglePlay() {
  if (audio.isPlaying.value) {
    audio.pause();
  } else {
    audio.play();
  }
}
</script>

<template>
  <div class="flex items-center justify-center w-full h-full p-0.5 overflow-hidden">
    <button
      :class="PLAY_BOX.micro"
      class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shrink-0"
      @click="togglePlay"
    >
      <Pause
        v-if="audio.isPlaying.value"
        :size="PLAY_SIZE.micro"
        class="text-primary"
        fill="currentColor"
      />
      <Play v-else :size="PLAY_SIZE.micro" class="text-primary ml-0.5" fill="currentColor" />
    </button>
  </div>
</template>
