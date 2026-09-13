<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX
} from '@lucide/vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { ICON, ICON_SM, PLAY_BOX, PLAY_SIZE } from '@renderer/utils/audioControls';

defineProps<{ compact: boolean }>();

const player = usePlayerStore();
const audio = useAudioPlayer();
const { t } = useI18n();

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
  <div class="flex flex-col items-center justify-center gap-2 w-full h-full px-3 py-2">
    <div class="flex items-center justify-center gap-4">
      <button
        class="p-2 rounded-full transition-colors"
        :class="
          player.shuffle
            ? 'text-primary'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
        "
        @click="player.toggleShuffle"
      >
        <Shuffle :size="ICON_SM.wide" />
      </button>
      <button
        class="p-2 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="player.prevTrack"
      >
        <SkipBack :size="ICON.wide" fill="currentColor" />
      </button>
      <div class="relative">
        <div
          v-if="audio.isPlaying.value"
          class="absolute inset-0 rounded-full bg-primary/15 blur-xl"
        />
        <button
          :class="PLAY_BOX.wide"
          class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
          @click="togglePlay"
        >
          <Pause
            v-if="audio.isPlaying.value"
            :size="PLAY_SIZE.wide"
            class="text-primary"
            fill="currentColor"
          />
          <Play v-else :size="PLAY_SIZE.wide" class="text-primary ml-0.5" fill="currentColor" />
        </button>
      </div>
      <button
        class="p-2 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="player.nextTrack"
      >
        <SkipForward :size="ICON.wide" fill="currentColor" />
      </button>
      <button
        class="p-2 rounded-full transition-colors"
        :class="
          player.repeat !== 'none'
            ? 'text-primary'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
        "
        @click="player.cycleRepeat"
      >
        <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.wide" />
      </button>
    </div>
    <div v-if="!compact" class="flex items-center justify-center gap-2 w-full max-w-[220px]">
      <button
        class="text-base-content/50 hover:text-base-content transition-colors shrink-0"
        @click="player.toggleMute"
      >
        <VolumeX v-if="player.isMuted" :size="ICON_SM.wide" />
        <Volume2 v-else :size="ICON_SM.wide" />
      </button>
      <div
        class="flex-1 min-w-0 h-1.5 bg-base-content/20 rounded-full cursor-pointer hover:h-2 transition-[height]"
        @click="onVolume"
      >
        <div
          class="h-full bg-primary/60 rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
    </div>
    <div v-if="!compact" class="flex items-center justify-center gap-2">
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :class="
          player.equalizerVisible
            ? 'bg-primary/10 text-primary'
            : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'
        "
        data-eq-toggle
        @click="player.toggleEqualizer"
      >
        <SlidersHorizontal :size="ICON_SM.wide" />
        EQ
      </button>
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
        :class="
          player.queueVisible
            ? 'bg-primary/10 text-primary'
            : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'
        "
        @click="player.toggleQueue"
      >
        <ListMusic :size="ICON_SM.wide" />
        {{ t('queue.title') }}
      </button>
    </div>
  </div>
</template>
