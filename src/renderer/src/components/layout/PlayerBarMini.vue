<script setup lang="ts">
import { Pause, Play, SkipBack, SkipForward, Disc3, Maximize2 } from '@lucide/vue';
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
}>();

const emit = defineEmits<{
  seek: [event: MouseEvent];
  'toggle-play': [];
  'audio-view': [];
  expand: [];
}>();

const player = usePlayerStore();
const audio = useAudioPlayer();
</script>

<template>
  <div
    data-testid="player-bar"
    :data-playing="audio.isPlaying.value ? 'true' : 'false'"
    class="h-12 bg-base-200/(--glass-alpha) border-t border-base-content/20 flex items-center px-3 gap-3 shrink-0 relative"
  >
    <div
      v-if="!isLive"
      class="absolute top-0 left-0 right-0 h-1 bg-border-default/50 cursor-pointer group hover:h-1.5 transition-[height] z-10"
      @click="emit('seek', $event)"
    >
      <div
        class="absolute inset-y-0 left-0 h-full bg-primary/50 rounded-r-full"
        :style="{ width: bufferedPct + '%' }"
      />
      <div
        class="absolute inset-y-0 left-0 h-full bg-primary rounded-r-full"
        :style="{ width: progressPct + '%' }"
      />
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
    <span v-if="isLive" class="text-[10px] font-bold tracking-widest text-error shrink-0">{{
      $t('player.live')
    }}</span>
    <span v-else class="text-[10px] text-base-content/50 font-mono tabular-nums">{{
      formatDuration(audio.currentTime.value)
    }}</span>
    <button
      class="p-1.5 text-base-content/50 hover:text-primary transition-colors"
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
