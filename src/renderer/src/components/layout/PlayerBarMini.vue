<script setup lang="ts">
import { Pause, Play, SkipBack, SkipForward, Disc3, Maximize2, Pin, PinOff } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { formatDuration } from '@renderer/utils/formatters';
import MediaCover from '@renderer/components/MediaCover.vue';
import TrackInfo from '@renderer/components/TrackInfo.vue';

defineProps<{
  displayTrack: MediaFile | null;
  coverClip?: string;
  progressPct: number;
  bufferedPct: number;
  isLive: boolean;
  pinned: boolean;
}>();

const emit = defineEmits<{
  seek: [event: MouseEvent];
  'seek-by': [delta: number];
  'toggle-play': [];
  'audio-view': [];
  expand: [];
  'toggle-pin': [];
}>();

const player = usePlayerStore();
const audio = useAudioPlayer();

function onSeekKeydown(e: KeyboardEvent): void {
  const step = e.shiftKey ? 30 : 5;
  const delta = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : null;
  if (delta === null) return;
  e.preventDefault();
  emit('seek-by', delta);
}
</script>

<template>
  <div
    data-testid="player-bar"
    :data-playing="audio.isPlaying.value ? 'true' : 'false'"
    class="h-12 bg-base-200/(--glass-alpha) border-t border-base-content/20 flex items-center px-3 gap-3 shrink-0 relative"
  >
    <div
      v-if="!isLive"
      class="group absolute -top-1 left-0 right-0 z-10 h-3 cursor-pointer"
      role="slider"
      tabindex="0"
      :aria-label="$t('playerView.seek')"
      :aria-valuemin="0"
      :aria-valuemax="audio.duration.value"
      :aria-valuenow="audio.currentTime.value"
      @click="emit('seek', $event)"
      @keydown="onSeekKeydown"
    >
      <div
        class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border-default/50 transition-[height] group-hover:h-1.5"
      >
        <div
          class="absolute inset-y-0 left-0 h-full rounded-r-full bg-primary/50"
          :style="{ width: bufferedPct + '%' }"
        />
        <div
          class="absolute inset-y-0 left-0 h-full rounded-r-full bg-primary"
          :style="{ width: progressPct + '%' }"
        />
      </div>
    </div>

    <div
      class="w-8 h-8 rounded-field bg-base-100 flex items-center justify-center shrink-0 overflow-hidden"
      :style="coverClip ? { clipPath: coverClip } : undefined"
    >
      <MediaCover :path="displayTrack?.path" :size="14" :autoplay="true" fallback="music" />
    </div>
    <TrackInfo
      :track="displayTrack"
      class="min-w-0 flex-1"
      titleSize="text-xs"
      :showArtist="false"
      :showFallback="true"
    />
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 text-base-content/70 hover:text-base-content transition-colors"
        :aria-label="$t('common.previous')"
        @click="player.prevTrack"
      >
        <SkipBack :size="14" fill="currentColor" />
      </button>
      <button
        class="w-8 h-8 rounded-full bg-base-content flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,opacity]"
        :aria-label="audio.isPlaying.value ? $t('common.pause') : $t('common.play')"
        @click="emit('toggle-play')"
      >
        <Pause v-if="audio.isPlaying.value" :size="14" class="text-base-200" fill="currentColor" />
        <Play v-else :size="14" class="text-base-200 ml-0.5" fill="currentColor" />
      </button>
      <button
        class="p-1.5 text-base-content/70 hover:text-base-content transition-colors"
        :aria-label="$t('common.next')"
        @click="player.nextTrack"
      >
        <SkipForward :size="14" fill="currentColor" />
      </button>
    </div>
    <span v-if="isLive" class="text-[11px] font-bold tracking-widest text-error shrink-0">{{
      $t('player.live')
    }}</span>
    <span v-else class="text-[11px] text-base-content/50 font-mono tabular-nums">{{
      formatDuration(audio.currentTime.value)
    }}</span>
    <button
      data-testid="mini-always-on-top"
      class="p-1.5 transition-colors"
      :class="pinned ? 'text-primary-text' : 'text-base-content/50 hover:text-base-content'"
      :title="$t('common.alwaysOnTop')"
      :aria-label="$t('common.alwaysOnTop')"
      :aria-pressed="pinned"
      @click="emit('toggle-pin')"
    >
      <Pin v-if="pinned" :size="13" /><PinOff v-else :size="13" />
    </button>
    <button
      class="p-1.5 text-base-content/50 hover:text-primary-text transition-colors"
      :title="$t('common.audioView')"
      :aria-label="$t('common.audioView')"
      @click="emit('audio-view')"
    >
      <Disc3 :size="13" />
    </button>
    <button
      class="p-1.5 text-base-content/50 hover:text-base-content transition-colors"
      :title="$t('common.miniPlayer')"
      :aria-label="$t('common.miniPlayer')"
      @click="emit('expand')"
    >
      <Maximize2 :size="13" />
    </button>
  </div>
</template>
