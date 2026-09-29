<script setup lang="ts">
import { computed } from 'vue';
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

// Tri-state (off / all / one) has no boolean equivalent, so the label names the
// current mode rather than exposing aria-pressed.
const repeatLabel = computed(() => {
  const mode = player.repeat;
  return mode === 'one'
    ? t('player.repeatOne')
    : mode === 'all'
      ? t('player.repeatAll')
      : t('player.repeatNone');
});
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

// The volume bar was a click-only div: reachable by neither keyboard nor
// assistive tech, so volume could not be changed without a mouse.
const VOLUME_STEP = 0.05;
function onVolumeKey(e: KeyboardEvent) {
  const current = player.isMuted ? 0 : player.volume;
  let next: number | null = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + VOLUME_STEP;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - VOLUME_STEP;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = 1;
  else if (e.key === 'PageUp') next = current + VOLUME_STEP * 2;
  else if (e.key === 'PageDown') next = current - VOLUME_STEP * 2;
  if (next === null) return;
  e.preventDefault();
  audio.setVolume(Math.max(0, Math.min(1, next)));
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2.5 w-full h-full px-1 py-2">
    <button
      class="p-1.5 rounded-full transition-colors"
      :class="
        player.shuffle
          ? 'text-primary'
          : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
      "
      :aria-label="t('common.shuffle')"
      :aria-pressed="player.shuffle"
      @click="player.toggleShuffle"
    >
      <Shuffle :size="ICON_SM.tall" />
    </button>
    <button
      class="p-1.5 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :aria-label="t('common.previous')"
      @click="player.prevTrack"
    >
      <SkipBack :size="ICON.tall" fill="currentColor" />
    </button>
    <div class="relative">
      <div
        v-if="audio.isPlaying.value"
        class="absolute inset-0 rounded-full bg-primary/15 blur-xl"
      />
      <button
        :class="PLAY_BOX.tall"
        class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
        :aria-label="audio.isPlaying.value ? t('common.pause') : t('common.play')"
        @click="togglePlay"
      >
        <Pause
          v-if="audio.isPlaying.value"
          :size="PLAY_SIZE.tall"
          class="text-primary"
          fill="currentColor"
        />
        <Play v-else :size="PLAY_SIZE.tall" class="text-primary ml-0.5" fill="currentColor" />
      </button>
    </div>
    <button
      class="p-1.5 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :aria-label="t('common.next')"
      @click="player.nextTrack"
    >
      <SkipForward :size="ICON.tall" fill="currentColor" />
    </button>
    <button
      class="p-1.5 rounded-full transition-colors"
      :class="
        player.repeat !== 'none'
          ? 'text-primary'
          : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
      "
      :aria-label="repeatLabel"
      @click="player.cycleRepeat"
    >
      <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.tall" />
    </button>
    <div v-if="!compact" class="flex items-center gap-1.5 w-full max-w-[140px]">
      <button
        class="text-base-content/50 hover:text-base-content transition-colors shrink-0"
        :aria-label="player.isMuted ? t('player.unmute') : t('common.mute')"
        @click="player.toggleMute"
      >
        <VolumeX v-if="player.isMuted" :size="ICON_SM.tall" />
        <Volume2 v-else :size="ICON_SM.tall" />
      </button>
      <div
        class="flex-1 min-w-0 h-1 bg-base-content/20 rounded-full cursor-pointer hover:h-1.5 transition-[height]"
        role="slider"
        tabindex="0"
        :aria-label="t('player.volumeSlider')"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="player.isMuted ? 0 : Math.round(player.volume * 100)"
        :aria-valuetext="player.isMuted ? t('player.muted') : undefined"
        @click="onVolume"
        @keydown="onVolumeKey"
      >
        <div
          class="h-full bg-primary/60 rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
    </div>
    <div v-if="!compact" class="flex items-center gap-1">
      <button
        class="fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors"
        :class="
          player.equalizerVisible
            ? 'bg-primary/10 text-primary'
            : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'
        "
        data-eq-toggle
        :aria-label="t('common.equalizer')"
        :aria-pressed="player.equalizerVisible"
        @click="player.toggleEqualizer"
      >
        <SlidersHorizontal :size="ICON_SM.tall" />
        EQ
      </button>
      <button
        class="fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors"
        :class="
          player.queueVisible
            ? 'bg-primary/10 text-primary'
            : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'
        "
        :aria-label="t('common.queue')"
        :aria-pressed="player.queueVisible"
        @click="player.toggleQueue"
      >
        <ListMusic :size="ICON_SM.tall" />
        {{ t('queue.title') }}
      </button>
    </div>
  </div>
</template>
