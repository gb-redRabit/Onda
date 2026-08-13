<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
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
  Volume1,
  Heart,
  ListMusic,
  SlidersHorizontal,
  Minimize2,
  Maximize2,
  Disc3
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { formatDuration } from '@renderer/utils/formatters';
import MediaCover from '@renderer/components/MediaCover.vue';
import TrackInfo from '@renderer/components/TrackInfo.vue';

const player = usePlayerStore();
const audio = useAudioPlayer();
const router = useRouter();
const isMini = ref(false);

const progressPct = computed(() =>
  audio.duration.value > 0 ? (audio.currentTime.value / audio.duration.value) * 100 : 0
);

function onSeek(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  const time = ((e.clientX - rect.left) / rect.width) * audio.duration.value;
  audio.seek(time);
}

function onVolume(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  audio.setVolume((e.clientX - rect.left) / rect.width);
}

function togglePlay() {
  if (audio.isPlaying.value) {
    audio.pause();
  } else {
    audio.play();
  }
}
</script>

<template>
  <!-- mini player -->
  <div
    v-if="isMini"
    class="h-12 bg-bg-overlay border-t border-border-default flex items-center px-3 gap-3 shrink-0 relative"
  >
    <div
      class="absolute top-0 left-0 right-0 h-0.5 bg-border-default/50 cursor-pointer group hover:h-1 transition-[height] z-10"
      @click="onSeek"
    >
      <div class="h-full bg-accent-base rounded-r-full" :style="{ width: progressPct + '%' }" />
    </div>

    <div
      class="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center shrink-0 overflow-hidden"
    >
      <MediaCover :path="player.currentTrack?.path" :size="14" fallback="music" />
    </div>
    <TrackInfo
      :track="player.currentTrack"
      class="min-w-0 flex-1"
      titleSize="text-xs"
      :showArtist="false"
      :showFallback="true"
    />
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 text-fg-muted hover:text-fg-base transition-colors"
        :aria-label="$t('common.previous')"
        @click="player.prevTrack"
      >
        <SkipBack :size="14" fill="currentColor" />
      </button>
      <button
        class="w-8 h-8 rounded-full bg-fg-base flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,opacity]"
        :aria-label="audio.isPlaying.value ? $t('common.pause') : $t('common.play')"
        @click="togglePlay"
      >
        <Pause v-if="audio.isPlaying.value" :size="14" class="text-bg-base" fill="currentColor" />
        <Play v-else :size="14" class="text-bg-base ml-0.5" fill="currentColor" />
      </button>
      <button
        class="p-1.5 text-fg-muted hover:text-fg-base transition-colors"
        :aria-label="$t('common.next')"
        @click="player.nextTrack"
      >
        <SkipForward :size="14" fill="currentColor" />
      </button>
    </div>
    <span class="text-[10px] text-fg-faint font-mono tabular-nums">{{
      formatDuration(audio.currentTime.value)
    }}</span>
    <button
      class="p-1.5 text-fg-faint hover:text-accent-base transition-colors"
      :title="$t('common.audioView')"
      :aria-label="$t('common.audioView')"
      @click="router.push('/audio')"
    >
      <Disc3 :size="13" />
    </button>
    <button
      class="p-1.5 text-fg-faint hover:text-fg-base transition-colors"
      :title="$t('common.miniPlayer')"
      :aria-label="$t('common.miniPlayer')"
      @click="isMini = false"
    >
      <Maximize2 :size="13" />
    </button>
  </div>

  <!-- full player -->
  <div
    v-else
    class="h-18 bg-bg-overlay border-t border-border-default flex items-center px-4 shrink-0 relative"
  >
    <div
      class="absolute top-0 left-0 right-0 h-1 bg-border-default/50 cursor-pointer group hover:h-1.5 transition-[height] z-10"
      @click="onSeek"
    >
      <div class="h-full bg-accent-base rounded-r-full" :style="{ width: progressPct + '%' }" />
    </div>

    <div class="flex items-center gap-3 w-70 min-w-0">
      <div
        class="w-11 h-11 rounded-lg bg-bg-elevated border border-border-default flex items-center justify-center shrink-0 overflow-hidden"
      >
        <MediaCover :path="player.currentTrack?.path" :size="18" fallback="music" />
      </div>
      <TrackInfo
        :track="player.currentTrack"
        class="min-w-0 flex-1"
        titleSize="text-sm"
        titleClass="text-fg-base"
        :showFallback="true"
      />
      <button
        class="shrink-0 p-1.5 transition-colors"
        :class="
          player.currentTrack && player.isFavorite(player.currentTrack.path)
            ? 'text-red-base'
            : 'text-fg-faint hover:text-red-base'
        "
        :disabled="!player.currentTrack"
        :aria-label="
          player.currentTrack && player.isFavorite(player.currentTrack.path)
            ? $t('common.removeFav')
            : $t('common.addFav')
        "
        @click="player.currentTrack && player.toggleFavorite(player.currentTrack.path)"
      >
        <Heart
          :size="15"
          :fill="
            player.currentTrack && player.isFavorite(player.currentTrack.path)
              ? 'currentColor'
              : 'none'
          "
        />
      </button>
    </div>

    <div class="flex-1 flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-3">
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :class="{ 'text-accent-base!': player.shuffle }"
          :aria-label="$t('common.shuffle')"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="15" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          :aria-label="$t('common.previous')"
          @click="player.prevTrack"
        >
          <SkipBack :size="17" fill="currentColor" />
        </button>
        <button
          class="w-10 h-10 rounded-full bg-fg-base flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,opacity] shadow-lg"
          :aria-label="audio.isPlaying.value ? $t('common.pause') : $t('common.play')"
          @click="togglePlay"
        >
          <Pause v-if="audio.isPlaying.value" :size="18" class="text-bg-base" fill="currentColor" />
          <Play v-else :size="18" class="text-bg-base ml-0.5" fill="currentColor" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          :aria-label="$t('common.next')"
          @click="player.nextTrack"
        >
          <SkipForward :size="17" fill="currentColor" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :class="{ 'text-accent-base!': player.repeat !== 'none' }"
          :aria-label="$t('common.repeat')"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="15" />
        </button>
      </div>
      <div class="flex items-center gap-2 text-[11px] text-fg-faint font-mono tabular-nums">
        <span>{{ formatDuration(audio.currentTime.value) }}</span>
        <span>/</span>
        <span>{{ formatDuration(audio.duration.value) }}</span>
      </div>
    </div>

    <div class="flex items-center gap-1.5 w-55 justify-end">
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        :class="{ 'text-accent-base!': player.equalizerVisible }"
        data-eq-toggle
        :aria-label="$t('common.equalizer')"
        @click="player.toggleEqualizer"
      >
        <SlidersHorizontal :size="15" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        :class="{ 'text-accent-base!': player.queueVisible }"
        :aria-label="$t('common.queue')"
        @click="player.toggleQueue"
      >
        <ListMusic :size="15" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        :aria-label="$t('common.mute')"
        @click="player.toggleMute"
      >
        <component
          :is="
            player.isMuted || player.volume === 0
              ? VolumeX
              : player.volume < 0.5
                ? Volume1
                : Volume2
          "
          :size="15"
        />
      </button>
      <div
        class="w-24 h-1 bg-border-default/60 rounded-full cursor-pointer hover:h-1.5 transition-[height]"
        @click="onVolume"
      >
        <div
          class="h-full bg-fg-base rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-accent-base hover:bg-bg-hover transition-colors"
        :title="$t('common.audioView')"
        :aria-label="$t('common.audioView')"
        @click="router.push('/audio')"
      >
        <Disc3 :size="15" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        :title="$t('common.miniPlayer')"
        :aria-label="$t('common.miniPlayer')"
        @click="isMini = true"
      >
        <Minimize2 :size="13" />
      </button>
    </div>
  </div>
</template>
