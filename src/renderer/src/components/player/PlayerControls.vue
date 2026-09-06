<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
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
  Gauge,
  ChevronLeft,
  ChevronRight,
  Heart,
  RotateCcw
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';
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

const speedSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const SPEED_MIN = 0.25;
const SPEED_MAX = 3;

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

// ---- speed menu ----
const speedMenuOpen = ref(false);
const speedContainer = ref<HTMLElement | null>(null);

const speedLabel = computed(() => {
  const v = props.speed;
  return `${Number.isInteger(v) ? v : Math.round(v * 100) / 100}x`;
});

const isPresetSpeed = computed(() => speedSteps.includes(props.speed));

function onSpeedOutsideClick(e: MouseEvent) {
  const target = e.target as Node;
  if (speedMenuOpen.value && speedContainer.value && !speedContainer.value.contains(target)) {
    speedMenuOpen.value = false;
  }
}

function onSpeedKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') speedMenuOpen.value = false;
}

watch(speedMenuOpen, (open) => {
  if (open) document.addEventListener('keydown', onSpeedKeydown);
  else document.removeEventListener('keydown', onSpeedKeydown);
});

onMounted(() => document.addEventListener('mousedown', onSpeedOutsideClick));
onUnmounted(() => {
  document.removeEventListener('mousedown', onSpeedOutsideClick);
  document.removeEventListener('keydown', onSpeedKeydown);
});

function setSpeedValue(v: number) {
  const clamped = Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(v * 100) / 100));
  emit('setSpeed', clamped);
}

function onSpeedSlider(e: Event) {
  setSpeedValue(parseFloat((e.target as HTMLInputElement).value));
}

function onSpeedPreset(v: number) {
  emit('setSpeed', v);
  speedMenuOpen.value = false;
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
        <button class="text-neutral-content/60 hover:text-neutral-content transition-colors" @click="player.prevTrack">
          <SkipBack :size="18" fill="currentColor" />
        </button>

        <!-- play button — glassmorphism -->
        <div class="relative">
          <div v-if="player.isPlaying" class="absolute inset-0 rounded-full bg-neutral-content/10 blur-lg" />
          <button
            class="relative w-12 h-12 rounded-full bg-neutral-content/15 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5"
            @click="player.togglePlay"
          >
            <Pause v-if="player.isPlaying" :size="22" class="text-neutral-content" fill="currentColor" />
            <Play v-else :size="22" class="text-neutral-content ml-0.5" fill="currentColor" />
          </button>
        </div>

        <button class="text-neutral-content/60 hover:text-neutral-content transition-colors" @click="player.nextTrack">
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
        <button class="text-neutral-content/40 hover:text-neutral-content transition-colors" @click="emit('skip', -10)">
          <ChevronLeft :size="18" />
        </button>

        <!-- time -->
        <div class="flex items-center gap-2 text-neutral-content/50 text-xs font-mono tabular-nums">
          <span>{{ formatDuration(player.currentTime) }}</span>
          <span class="text-neutral-content/20">/</span>
          <span>{{ formatDuration(player.duration) }}</span>
        </div>

        <!-- speed -->
        <div ref="speedContainer" class="relative flex items-center">
          <button
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors cursor-pointer select-none"
            :class="
              speed !== 1
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-neutral-content/40 hover:text-neutral-content/70 bg-neutral-content/6 hover:bg-neutral-content/10'
            "
            :aria-haspopup="true"
            :aria-expanded="speedMenuOpen"
            :aria-label="$t('player.speedTitle') + ': ' + speedLabel"
            :title="$t('player.speedTitle')"
            @click.stop="speedMenuOpen = !speedMenuOpen"
          >
            <Gauge :size="11" />
            {{ speedLabel }}
          </button>

          <Transition name="menu-fade">
            <div
              v-if="speedMenuOpen"
              class="absolute bottom-full right-0 mb-2 w-64 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/50 p-3 z-50"
            >
              <div class="flex items-center justify-between mb-2.5">
                <span class="text-[10px] text-base-content/50 font-medium uppercase tracking-wider">
                  {{ $t('player.speedTitle') }}
                </span>
                <span class="text-[11px] font-mono text-primary tabular-nums">{{
                  speedLabel
                }}</span>
              </div>

              <div class="grid grid-cols-3 gap-1.5 mb-3">
                <button
                  v-for="step in speedSteps"
                  :key="step"
                  class="fx-noise px-2 py-1.5 fx-depth rounded-field text-[11px] font-mono transition-colors"
                  :class="
                    speed === step
                      ? 'bg-primary text-primary-content font-semibold'
                      : 'bg-base-200/[var(--glass-alpha)] text-base-content/70 hover:bg-base-content/10 hover:text-base-content'
                  "
                  @click="onSpeedPreset(step)"
                >
                  {{ step }}x
                </button>
              </div>

              <div class="flex items-center gap-2">
                <Gauge :size="12" class="text-base-content/50 shrink-0" />
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.05"
                  :value="speed"
                  class="flex-1 accent-primary cursor-pointer"
                  :aria-label="$t('player.speedCustom')"
                  @input="onSpeedSlider"
                />
              </div>
              <div
                class="flex items-center justify-between text-[9px] text-base-content/60 font-mono mt-1 px-0.5"
              >
                <span>0.25x</span>
                <span>3x</span>
              </div>

              <div class="flex items-center justify-between mt-2.5 pt-2.5 border-t border-base-300">
                <span class="text-[10px] text-base-content/60">{{ $t('player.speedHint') }}</span>
                <button
                  class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field text-[10px] text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
                  :class="{ 'pointer-events-none opacity-40': speed === 1 && isPresetSpeed }"
                  :disabled="speed === 1 && isPresetSpeed"
                  @click="onSpeedPreset(1)"
                >
                  <RotateCcw :size="10" />
                  {{ $t('player.speedReset') }}
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- skip forward -->
        <button class="text-neutral-content/40 hover:text-neutral-content transition-colors" @click="emit('skip', 10)">
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
        <button class="text-neutral-content/50 hover:text-neutral-content transition-colors" @click="player.toggleMute">
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
