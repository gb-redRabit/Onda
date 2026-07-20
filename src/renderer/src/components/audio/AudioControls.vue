<script setup lang="ts">
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  SlidersHorizontal
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';

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
  <div class="flex items-center justify-center gap-4">
    <!-- shuffle -->
    <button
      class="p-2 rounded-full transition-colors"
      :class="
        player.shuffle
          ? 'text-accent-base'
          : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
      "
      @click="player.toggleShuffle"
    >
      <Shuffle :size="16" />
    </button>

    <!-- prev -->
    <button
      class="p-2 rounded-full text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
      @click="player.prevTrack"
    >
      <SkipBack :size="18" fill="currentColor" />
    </button>

    <!-- play/pause — glassmorphism -->
    <div class="relative">
      <div v-if="audio.isPlaying.value" class="absolute inset-0 rounded-full bg-accent-base/15 blur-xl" />
      <button
        class="relative w-12 h-12 rounded-full bg-accent-base/15 backdrop-blur-xl border border-accent-base/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
        @click="togglePlay"
      >
        <Pause
          v-if="audio.isPlaying.value"
          :size="22"
          class="text-accent-base"
          fill="currentColor"
        />
        <Play v-else :size="22" class="text-accent-base ml-0.5" fill="currentColor" />
      </button>
    </div>

    <!-- next -->
    <button
      class="p-2 rounded-full text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
      @click="player.nextTrack"
    >
      <SkipForward :size="18" fill="currentColor" />
    </button>

    <!-- repeat -->
    <button
      class="p-2 rounded-full transition-colors"
      :class="
        player.repeat !== 'none'
          ? 'text-accent-base'
          : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
      "
      @click="player.cycleRepeat"
    >
      <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="16" />
    </button>
  </div>

  <!-- volume row -->
  <div class="flex items-center justify-center gap-2 mt-3">
    <button
      class="text-fg-faint hover:text-fg-base transition-colors"
      @click="player.toggleMute"
    >
      <VolumeX v-if="player.isMuted" :size="14" />
      <Volume2 v-else :size="14" />
    </button>
    <div
      class="w-24 h-1 bg-bg-active rounded-full cursor-pointer hover:h-1.5 transition-all"
      @click="onVolume"
    >
      <div
        class="h-full bg-accent-base/60 rounded-full"
        :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
      />
    </div>
  </div>

  <!-- EQ + Queue toggles -->
  <div class="flex items-center justify-center gap-2 mt-2">
    <button
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
      :class="
        player.equalizerVisible
          ? 'bg-accent-ghost text-accent-base'
          : 'text-fg-faint hover:text-fg-muted hover:bg-bg-hover'
      "
      @click="player.toggleEqualizer"
    >
      <SlidersHorizontal :size="12" />
      EQ
    </button>
    <button
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
      :class="
        player.queueVisible
          ? 'bg-accent-ghost text-accent-base'
          : 'text-fg-faint hover:text-fg-muted hover:bg-bg-hover'
      "
      @click="player.toggleQueue"
    >
      <ListMusic :size="12" />
      Kolejka
    </button>
  </div>
</template>
