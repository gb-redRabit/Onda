<script setup lang="ts">
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from '@lucide/vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { ICON, ICON_SM, PLAY_BOX, PLAY_SIZE } from '@renderer/utils/audioControls';

defineProps<{ compact: boolean; widthSufficient: boolean; volumeFit: boolean }>();

const player = usePlayerStore();
const audio = useAudioPlayer();

function togglePlay() {
  if (audio.isPlaying.value) {
    audio.pause();
  } else {
    audio.play();
  }
}

function onVolume(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  audio.setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-0.5 w-full h-full overflow-hidden">
    <div v-if="widthSufficient" class="flex items-center justify-center gap-1.5 shrink-0">
      <button
        class="p-1 rounded-full transition-colors"
        :class="
          player.shuffle
            ? 'text-primary'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
        "
        @click="player.toggleShuffle"
      >
        <Shuffle :size="ICON_SM.minimal" />
      </button>
      <button
        class="p-1 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="player.prevTrack"
      >
        <SkipBack :size="ICON.minimal" fill="currentColor" />
      </button>
      <div class="relative">
        <div
          v-if="audio.isPlaying.value"
          class="absolute inset-0 rounded-full bg-primary/15 blur-md"
        />
        <button
          :class="PLAY_BOX.minimal"
          class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
          @click="togglePlay"
        >
          <Pause
            v-if="audio.isPlaying.value"
            :size="PLAY_SIZE.minimal"
            class="text-primary"
            fill="currentColor"
          />
          <Play v-else :size="PLAY_SIZE.minimal" class="text-primary ml-0.5" fill="currentColor" />
        </button>
      </div>
      <button
        class="p-1 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="player.nextTrack"
      >
        <SkipForward :size="ICON.minimal" fill="currentColor" />
      </button>
      <button
        class="p-1 rounded-full transition-colors"
        :class="
          player.repeat !== 'none'
            ? 'text-primary'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
        "
        @click="player.cycleRepeat"
      >
        <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.minimal" />
      </button>
    </div>
    <button
      v-else
      :class="PLAY_BOX.minimal"
      class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shrink-0"
      @click="togglePlay"
    >
      <Pause
        v-if="audio.isPlaying.value"
        :size="PLAY_SIZE.minimal"
        class="text-primary"
        fill="currentColor"
      />
      <Play v-else :size="PLAY_SIZE.minimal" class="text-primary ml-0.5" fill="currentColor" />
    </button>
    <div
      v-if="!compact && !widthSufficient && volumeFit"
      class="flex items-center gap-1 w-full max-w-[90px] px-1 justify-center shrink-0"
    >
      <button
        class="text-base-content/50 hover:text-base-content transition-colors shrink-0"
        @click="player.toggleMute"
      >
        <VolumeX v-if="player.isMuted" :size="ICON_SM.minimal" />
        <Volume2 v-else :size="ICON_SM.minimal" />
      </button>
      <div
        class="flex-1 min-w-0 h-0.5 bg-base-content/20 rounded-full cursor-pointer hover:h-1 transition-[height]"
        @click="onVolume"
      >
        <div
          class="h-full bg-primary/60 rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
    </div>
  </div>
</template>
