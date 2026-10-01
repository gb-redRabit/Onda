<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import {
  Volume2,
  VolumeX,
  ListMusic,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';
import PlayerSpeedMenu from './PlayerSpeedMenu.vue';
import TransportButtons from './TransportButtons.vue';
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

function onSeekKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 30 : 5;
  const next =
    e.key === 'ArrowLeft'
      ? player.currentTime - step
      : e.key === 'ArrowRight'
        ? player.currentTime + step
        : e.key === 'PageDown'
          ? player.currentTime - 30
          : e.key === 'PageUp'
            ? player.currentTime + 30
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? player.duration
                : null;
  if (next === null) return;
  e.preventDefault();
  emit('seek', Math.max(0, Math.min(player.duration, next)));
}

function onVolumeClick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const v = (e.clientX - r.left) / r.width;
  emit('volumeChange', v);
}

function onVolumeKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 0.1 : 0.05;
  const next =
    e.key === 'ArrowDown' || e.key === 'ArrowLeft'
      ? player.volume - step
      : e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? player.volume + step
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? 1
            : null;
  if (next === null) return;
  e.preventDefault();
  emit('volumeChange', Math.max(0, Math.min(1, next)));
}
</script>

<template>
  <div
    data-wheel-ignore
    class="absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-neutral/80 via-neutral/30 to-transparent pt-12 pb-6 px-6 transition-opacity"
    :class="{ 'opacity-0': !showControls }"
  >
    <!-- pasek przewijania -->
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
      role="slider"
      tabindex="0"
      :aria-label="$t('playerView.seek')"
      :aria-valuemin="0"
      :aria-valuemax="player.duration"
      :aria-valuenow="player.currentTime"
      :aria-valuetext="`${formatDuration(player.currentTime)} / ${formatDuration(player.duration)}`"
      @click="onSeek"
      @keydown="onSeekKeydown"
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
      <!-- lewa: przyciski odtwarzania -->
      <TransportButtons
        variant="video"
        :is-playing="player.isPlaying"
        :shuffle="player.shuffle"
        :repeat="player.repeat"
        :favorite="player.isFavorite(player.currentTrack?.path || '')"
        :show-favorite="true"
        @play-pause="player.togglePlay"
        @prev="player.prevTrack"
        @next="player.nextTrack"
        @toggle-shuffle="player.toggleShuffle"
        @cycle-repeat="player.cycleRepeat"
        @toggle-favorite="player.toggleFavorite(player.currentTrack?.path || '')"
      />

      <!-- środek: przewijanie — czas — prędkość -->
      <div class="flex items-center gap-4">
        <!-- przewiń wstecz -->
        <button
          class="text-neutral-content/40 hover:text-neutral-content transition-colors"
          :aria-label="$t('playerView.seekBackward')"
          @click="emit('skip', -10)"
        >
          <ChevronLeft :size="18" />
        </button>

        <!-- czas -->
        <div class="flex items-center gap-2 text-neutral-content/50 text-xs font-mono tabular-nums">
          <span>{{ formatDuration(player.currentTime) }}</span>
          <span class="text-neutral-content/20">/</span>
          <span>{{ formatDuration(player.duration) }}</span>
        </div>

        <PlayerSpeedMenu :speed="speed" @set-speed="emit('setSpeed', $event)" />
        <!-- przewiń w przód -->
        <button
          class="text-neutral-content/40 hover:text-neutral-content transition-colors"
          :aria-label="$t('playerView.seekForward')"
          @click="emit('skip', 10)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <!-- prawa strona: narzędzia + głośność -->
      <div class="flex items-center gap-2.5">
        <VideoFilterDropdown />
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-primary!': player.equalizerVisible }"
          data-eq-toggle
          :aria-label="$t('common.equalizer')"
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="16" />
        </button>
        <button
          class="text-neutral-content/40 hover:text-neutral-content/80 transition-colors"
          :class="{ 'text-primary!': player.queueVisible }"
          :aria-label="$t('common.queue')"
          @click="player.toggleQueue"
        >
          <ListMusic :size="16" />
        </button>
        <SubtitleTrackSelector />
        <button
          class="text-neutral-content/50 hover:text-neutral-content transition-colors"
          :aria-label="$t('common.mute')"
          @click="player.toggleMute"
        >
          <VolumeX v-if="player.isMuted" :size="16" />
          <Volume2 v-else :size="16" />
        </button>

        <!-- pasek głośności — akcent -->
        <div
          class="w-20 h-1 bg-neutral-content/10 rounded-full cursor-pointer hover:h-1.5 transition-[height]"
          role="slider"
          tabindex="0"
          :aria-label="$t('playerView.volume')"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="Math.round(player.volume * 100)"
          @click="onVolumeClick"
          @keydown="onVolumeKeydown"
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
