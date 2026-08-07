<script setup lang="ts">
import { computed } from 'vue';
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
  Gauge,
  ChevronLeft,
  ChevronRight,
  Heart
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';
import SubtitleTrackSelector from './SubtitleTrackSelector.vue';
import VideoFilterDropdown from './VideoFilterDropdown.vue';

const props = defineProps<{
  showControls: boolean;
  speed: number;
}>();

const emit = defineEmits<{
  seek: [time: number];
  volumeChange: [value: number];
  setSpeed: [speed: number];
  skip: [seconds: number];
}>();

const player = usePlayerStore();

const progressPct = computed(() =>
  player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0
);

const speedSteps = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

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

function cycleSpeed(direction: number) {
  const currentIdx = speedSteps.indexOf(props.speed);
  if (currentIdx >= 0) {
    const nextIdx = Math.max(0, Math.min(speedSteps.length - 1, currentIdx + direction));
    emit('setSpeed', speedSteps[nextIdx]);
  } else {
    const newSpeed =
      Math.round(Math.max(0.2, Math.min(3, props.speed + direction * 0.25)) * 10) / 10;
    emit('setSpeed', newSpeed);
  }
}
</script>

<template>
  <div
    class="absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-black/80 via-black/30 to-transparent pt-12 pb-6 px-6 transition-opacity"
    :class="{ 'opacity-0': !showControls }"
  >
    <!-- seek bar -->
    <div
      class="w-full h-1.5 bg-white/10 rounded-full cursor-pointer hover:h-2.5 transition-[height] mb-4"
      @click="onSeek"
    >
      <div
        class="h-full bg-accent-base/80 rounded-full relative"
        :style="{ width: progressPct + '%' }"
      >
        <div
          class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg opacity-0 hover:opacity-100 transition-opacity"
        />
      </div>
    </div>

    <div class="flex items-center justify-between">
      <!-- left: playback buttons -->
      <div class="flex items-center gap-3">
        <button
          class="text-white/40 hover:text-white/80 transition-colors"
          :class="{ 'text-accent-base!': player.shuffle }"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="16" />
        </button>
        <button
          class="text-white/40 hover:text-white/80 transition-colors"
          :class="{ 'text-red-base!': player.isFavorite(player.currentTrack?.path || '') }"
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
        <button class="text-white/60 hover:text-white transition-colors" @click="player.prevTrack">
          <SkipBack :size="18" fill="currentColor" />
        </button>

        <!-- play button — glassmorphism -->
        <div class="relative">
          <div v-if="player.isPlaying" class="absolute inset-0 rounded-full bg-white/10 blur-lg" />
          <button
            class="relative w-12 h-12 rounded-full bg-white/15 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5"
            @click="player.togglePlay"
          >
            <Pause v-if="player.isPlaying" :size="22" class="text-white" fill="currentColor" />
            <Play v-else :size="22" class="text-white ml-0.5" fill="currentColor" />
          </button>
        </div>

        <button class="text-white/60 hover:text-white transition-colors" @click="player.nextTrack">
          <SkipForward :size="18" fill="currentColor" />
        </button>
        <button
          class="text-white/40 hover:text-white/80 transition-colors"
          :class="{ 'text-accent-base!': player.repeat !== 'none' }"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="16" />
        </button>
      </div>

      <!-- center: skip — time — speed -->
      <div class="flex items-center gap-4">
        <!-- skip back -->
        <button class="text-white/40 hover:text-white transition-colors" @click="emit('skip', -10)">
          <ChevronLeft :size="18" />
        </button>

        <!-- time -->
        <div class="flex items-center gap-2 text-white/50 text-xs font-mono tabular-nums">
          <span>{{ formatDuration(player.currentTime) }}</span>
          <span class="text-white/20">/</span>
          <span>{{ formatDuration(player.duration) }}</span>
        </div>

        <!-- speed pill -->
        <div class="flex items-center">
          <button
            class="text-white/25 hover:text-white/50 transition-colors px-1"
            @click.stop="cycleSpeed(-1)"
          >
            <ChevronLeft :size="10" />
          </button>
          <button
            class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors"
            :class="
              speed !== 1
                ? 'text-accent-base bg-accent-ghost'
                : 'text-white/40 hover:text-white/70 bg-white/6 hover:bg-white/10'
            "
            @click.stop="cycleSpeed(1)"
          >
            <Gauge :size="11" />
            {{ speed }}x
          </button>
          <button
            class="text-white/25 hover:text-white/50 transition-colors px-1"
            @click.stop="cycleSpeed(1)"
          >
            <ChevronRight :size="10" />
          </button>
        </div>

        <!-- skip forward -->
        <button class="text-white/40 hover:text-white transition-colors" @click="emit('skip', 10)">
          <ChevronRight :size="18" />
        </button>
      </div>

      <!-- right side: tools + volume -->
      <div class="flex items-center gap-2.5">
        <VideoFilterDropdown />
        <button
          class="text-white/40 hover:text-white/80 transition-colors"
          :class="{ 'text-accent-base!': player.equalizerVisible }"
          data-eq-toggle
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="16" />
        </button>
        <button
          class="text-white/40 hover:text-white/80 transition-colors"
          :class="{ 'text-accent-base!': player.queueVisible }"
          @click="player.toggleQueue"
        >
          <ListMusic :size="16" />
        </button>
        <SubtitleTrackSelector />
        <button class="text-white/50 hover:text-white transition-colors" @click="player.toggleMute">
          <VolumeX v-if="player.isMuted" :size="16" />
          <Volume2 v-else :size="16" />
        </button>

        <!-- volume bar — accent -->
        <div
          class="w-20 h-1 bg-white/10 rounded-full cursor-pointer hover:h-1.5 transition-[height]"
          @click="onVolumeClick"
        >
          <div
            class="h-full bg-accent-base/70 rounded-full transition-colors"
            :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

