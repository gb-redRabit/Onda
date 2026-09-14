<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Heart
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';
import PlayerSpeedMenu from './PlayerSpeedMenu.vue';
import { useVideoPreview } from '@renderer/composables/useVideoPreview';
import SubtitleTrackSelector from './SubtitleTrackSelector.vue';
import VideoFilterDropdown from './VideoFilterDropdown.vue';

const props = defineProps<{
  showControls: boolean;
  speed: number;
  videoRef: Ref<HTMLVideoElement | null>;
}>();

const emit = defineEmits<{
  seek: [time: number];
  volumeChange: [value: number];
  setSpeed: [speed: number];
  skip: [seconds: number];
}>();

const player = usePlayerStore();

const seekBarRef = ref<HTMLElement | null>(null);
const {
  setHiddenVideoRef,
  previewVisible,
  previewDataUrl,
  previewLeft,
  previewTimeLabel,
  onMouseMove: previewMouseMove,
  onMouseLeave: previewMouseLeave
} = useVideoPreview(props.videoRef, seekBarRef);

const progressPct = computed(() =>
  player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0
);

function onSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  emit('seek', pct * player.duration);
}

function onVolumeClick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const v = (e.clientX - r.left) / r.width;
  emit('volumeChange', v);
}
</script>

<template>
  <div
    data-wheel-ignore
    class="absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-neutral/80 via-neutral/30 to-transparent pt-12 pb-6 px-6 transition-opacity"
    :class="{ 'opacity-0': !showControls }"
  >
    <!-- seek bar -->
    <video
      :ref="setHiddenVideoRef"
      class="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"
      muted
      playsinline
      preload="auto"
    />
    <div
      ref="seekBarRef"
      class="relative w-full h-1.5 bg-neutral-content/10 rounded-full cursor-pointer hover:h-2.5 transition-[height] mb-4"
      @click="onSeek"
      @mousemove="previewMouseMove"
      @mouseleave="previewMouseLeave"
    >
      <div class="h-full bg-primary/80 rounded-full relative" :style="{ width: progressPct + '%' }">
        <div
          class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-neutral-content shadow-lg opacity-0 hover:opacity-100 transition-opacity"
        />
      </div>

      <div
        v-if="previewVisible"
        class="absolute -top-2 -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
        :style="{ left: previewLeft + '%' }"
      >
        <div
          class="rounded-field overflow-hidden shadow-2xl border border-white/10 bg-neutral"
          style="width: 160px; height: 90px"
        >
          <img
            v-if="previewDataUrl"
            :src="previewDataUrl"
            class="w-full h-full object-cover"
            alt=""
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-[10px] text-neutral-content/50"
          >
            {{ previewTimeLabel() }}
          </div>
        </div>
        <span
          class="mt-1 px-1.5 py-0.5 rounded-field text-[11px] font-mono tabular-nums bg-neutral/70 text-neutral-content"
        >
          {{ previewTimeLabel() }}
        </span>
      </div>
    </div>

    <div class="flex items-center justify-between">
      <!-- left: playback buttons -->
      <div class="flex items-center gap-3">
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-primary!': player.shuffle }"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="16" />
        </button>
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-error!': player.isFavorite(player.currentTrack?.path || '') }"
          :title="
            player.isFavorite(player.currentTrack?.path || '')
              ? $t('common.removeFav')
              : $t('common.addFav')
          "
          @click="player.toggleFavorite(player.currentTrack?.path || '')"
        >
          <Heart
            :size="16"
            :fill="player.isFavorite(player.currentTrack?.path || '') ? 'currentColor' : 'none'"
          />
        </button>
        <button
          class="text-neutral-content/60 hover:text-neutral-content transition-colors"
          @click="player.prevTrack"
        >
          <SkipBack :size="18" fill="currentColor" />
        </button>

        <!-- play button — glassmorphism -->
        <div class="relative">
          <div
            v-if="player.isPlaying"
            class="absolute inset-0 rounded-full bg-neutral-content/10 blur-lg"
          />
          <button
            class="relative w-12 h-12 rounded-full bg-neutral-content/15 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5"
            @click="player.togglePlay"
          >
            <Pause
              v-if="player.isPlaying"
              :size="22"
              class="text-neutral-content"
              fill="currentColor"
            />
            <Play v-else :size="22" class="text-neutral-content ml-0.5" fill="currentColor" />
          </button>
        </div>

        <button
          class="text-neutral-content/60 hover:text-neutral-content transition-colors"
          @click="player.nextTrack"
        >
          <SkipForward :size="18" fill="currentColor" />
        </button>
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-primary!': player.repeat !== 'none' }"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="16" />
        </button>
      </div>

      <!-- center: skip — time — speed -->
      <div class="flex items-center gap-4">
        <!-- skip back -->
        <button
          class="text-neutral-content/40 hover:text-neutral-content transition-colors"
          @click="emit('skip', -10)"
        >
          <ChevronLeft :size="18" />
        </button>

        <!-- time -->
        <div class="flex items-center gap-2 text-neutral-content/50 text-xs font-mono tabular-nums">
          <span>{{ formatDuration(player.currentTime) }}</span>
          <span class="text-neutral-content/20">/</span>
          <span>{{ formatDuration(player.duration) }}</span>
        </div>

        <PlayerSpeedMenu :speed="speed" @set-speed="emit('setSpeed', $event)" />
        <!-- skip forward -->
        <button
          class="text-neutral-content/40 hover:text-neutral-content transition-colors"
          @click="emit('skip', 10)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <!-- right side: tools + volume -->
      <div class="flex items-center gap-2.5">
        <VideoFilterDropdown />
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-primary!': player.equalizerVisible }"
          data-eq-toggle
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="16" />
        </button>
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-primary!': player.queueVisible }"
          @click="player.toggleQueue"
        >
          <ListMusic :size="16" />
        </button>
        <SubtitleTrackSelector />
        <button
          class="text-neutral-content/50 hover:text-neutral-content transition-colors"
          @click="player.toggleMute"
        >
          <VolumeX v-if="player.isMuted" :size="16" />
          <Volume2 v-else :size="16" />
        </button>

        <!-- volume bar — accent -->
        <div
          class="w-20 h-1 bg-neutral-content/10 rounded-full cursor-pointer hover:h-1.5 transition-[height]"
          @click="onVolumeClick"
        >
          <div
            class="h-full bg-primary/70 rounded-full transition-colors"
            :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
