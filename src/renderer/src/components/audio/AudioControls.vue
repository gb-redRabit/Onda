<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
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

const props = defineProps<{ variant?: string }>();

const player = usePlayerStore();
const audio = useAudioPlayer();

const compact = computed(() => props.variant === 'compact');

const rootEl = ref<HTMLElement | null>(null);
type LayoutMode = 'wide' | 'compact' | 'tall' | 'minimal' | 'micro';
const mode = ref<LayoutMode>('wide');

const ICON = { wide: 18, compact: 14, tall: 16, minimal: 12, micro: 11 } as const;
const ICON_SM = { wide: 16, compact: 12, tall: 14, minimal: 10, micro: 9 } as const;
const PLAY_SIZE = { wide: 22, compact: 18, tall: 20, minimal: 14, micro: 13 } as const;
const PLAY_BOX = {
  wide: 'w-12 h-12',
  compact: 'w-9 h-9',
  tall: 'w-10 h-10',
  minimal: 'w-7 h-7',
  micro: 'w-6 h-6'
} as const;

function calcMode(w: number, h: number): LayoutMode {
  if (h < 28) return 'micro';
  if (w >= 280 && h >= 120) return 'wide';
  if (w >= 180 && h >= 100) return 'compact';
  if (h >= 140) return 'tall';
  return 'minimal';
}

let ro: ResizeObserver | null = null;
const boxW = ref(0);
const boxH = ref(0);
const widthSufficient = computed(() => boxW.value >= 120);
const volumeFit = computed(() => boxH.value >= 42);

onMounted(() => {
  if (!rootEl.value) return;
  ro = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    boxW.value = width;
    boxH.value = height;
    mode.value = calcMode(width, height);
  });
  ro.observe(rootEl.value);
});

onBeforeUnmount(() => {
  ro?.disconnect();
});

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
  <div ref="rootEl" class="w-full h-full overflow-hidden">
    <!-- ═══ WIDE (≥280 × ≥120) ═══ -->
    <div v-if="mode === 'wide'" class="flex flex-col items-center justify-center gap-2 w-full h-full px-3 py-2">
      <div class="flex items-center justify-center gap-4">
        <button
          class="p-2 rounded-full transition-colors"
          :class="player.shuffle ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
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
          <div v-if="audio.isPlaying.value" class="absolute inset-0 rounded-full bg-primary/15 blur-xl" />
          <button
            :class="PLAY_BOX.wide"
            class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
            @click="togglePlay"
          >
            <Pause v-if="audio.isPlaying.value" :size="PLAY_SIZE.wide" class="text-primary" fill="currentColor" />
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
          :class="player.repeat !== 'none' ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.wide" />
        </button>
      </div>
      <div v-if="!compact" class="flex items-center justify-center gap-2 w-full max-w-[220px]">
        <button class="text-base-content/50 hover:text-base-content transition-colors shrink-0" @click="player.toggleMute">
          <VolumeX v-if="player.isMuted" :size="ICON_SM.wide" />
          <Volume2 v-else :size="ICON_SM.wide" />
        </button>
        <div class="flex-1 min-w-0 h-1.5 bg-base-content/20 rounded-full cursor-pointer hover:h-2 transition-[height]" @click="onVolume">
          <div class="h-full bg-primary/60 rounded-full" :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }" />
        </div>
      </div>
      <div v-if="!compact" class="flex items-center justify-center gap-2">
        <button
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
          :class="player.equalizerVisible ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'"
          data-eq-toggle
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="ICON_SM.wide" />
          EQ
        </button>
        <button
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
          :class="player.queueVisible ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'"
          @click="player.toggleQueue"
        >
          <ListMusic :size="ICON_SM.wide" />
          {{ $t('queue.title') }}
        </button>
      </div>
    </div>

    <!-- ═══ COMPACT (≥180 × ≥100) ═══ -->
    <div v-else-if="mode === 'compact'" class="flex flex-col items-center justify-center gap-1.5 w-full h-full px-2 py-1">
      <div class="flex items-center justify-center gap-2">
        <button
          class="p-1.5 rounded-full transition-colors"
          :class="player.shuffle ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="ICON_SM.compact" />
        </button>
        <button
          class="p-1.5 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          @click="player.prevTrack"
        >
          <SkipBack :size="ICON.compact" fill="currentColor" />
        </button>
        <div class="relative">
          <div v-if="audio.isPlaying.value" class="absolute inset-0 rounded-full bg-primary/15 blur-lg" />
          <button
            :class="PLAY_BOX.compact"
            class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
            @click="togglePlay"
          >
            <Pause v-if="audio.isPlaying.value" :size="PLAY_SIZE.compact" class="text-primary" fill="currentColor" />
            <Play v-else :size="PLAY_SIZE.compact" class="text-primary ml-0.5" fill="currentColor" />
          </button>
        </div>
        <button
          class="p-1.5 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          @click="player.nextTrack"
        >
          <SkipForward :size="ICON.compact" fill="currentColor" />
        </button>
        <button
          class="p-1.5 rounded-full transition-colors"
          :class="player.repeat !== 'none' ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.compact" />
        </button>
      </div>
      <div v-if="!compact" class="flex items-center justify-center gap-1.5 w-full max-w-[160px]">
        <button class="text-base-content/50 hover:text-base-content transition-colors shrink-0" @click="player.toggleMute">
          <VolumeX v-if="player.isMuted" :size="ICON_SM.compact" />
          <Volume2 v-else :size="ICON_SM.compact" />
        </button>
        <div class="flex-1 min-w-0 h-1 bg-base-content/20 rounded-full cursor-pointer hover:h-1.5 transition-[height]" @click="onVolume">
          <div class="h-full bg-primary/60 rounded-full" :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }" />
        </div>
      </div>
      <div v-if="!compact" class="flex items-center justify-center gap-1">
        <button
          class="fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors"
          :class="player.equalizerVisible ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'"
          data-eq-toggle
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="ICON_SM.compact" />
        </button>
        <button
          class="fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors"
          :class="player.queueVisible ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'"
          @click="player.toggleQueue"
        >
          <ListMusic :size="ICON_SM.compact" />
        </button>
      </div>
    </div>

    <!-- ═══ TALL (<180 × ≥140) ═══ -->
    <div v-else-if="mode === 'tall'" class="flex flex-col items-center justify-center gap-2.5 w-full h-full px-1 py-2">
      <button
        class="p-1.5 rounded-full transition-colors"
        :class="player.shuffle ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
        @click="player.toggleShuffle"
      >
        <Shuffle :size="ICON_SM.tall" />
      </button>
      <button
        class="p-1.5 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="player.prevTrack"
      >
        <SkipBack :size="ICON.tall" fill="currentColor" />
      </button>
      <div class="relative">
        <div v-if="audio.isPlaying.value" class="absolute inset-0 rounded-full bg-primary/15 blur-xl" />
        <button
          :class="PLAY_BOX.tall"
          class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
          @click="togglePlay"
        >
          <Pause v-if="audio.isPlaying.value" :size="PLAY_SIZE.tall" class="text-primary" fill="currentColor" />
          <Play v-else :size="PLAY_SIZE.tall" class="text-primary ml-0.5" fill="currentColor" />
        </button>
      </div>
      <button
        class="p-1.5 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="player.nextTrack"
      >
        <SkipForward :size="ICON.tall" fill="currentColor" />
      </button>
      <button
        class="p-1.5 rounded-full transition-colors"
        :class="player.repeat !== 'none' ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
        @click="player.cycleRepeat"
      >
        <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.tall" />
      </button>
      <div v-if="!compact" class="flex items-center gap-1.5 w-full max-w-[140px]">
        <button class="text-base-content/50 hover:text-base-content transition-colors shrink-0" @click="player.toggleMute">
          <VolumeX v-if="player.isMuted" :size="ICON_SM.tall" />
          <Volume2 v-else :size="ICON_SM.tall" />
        </button>
        <div class="flex-1 min-w-0 h-1 bg-base-content/20 rounded-full cursor-pointer hover:h-1.5 transition-[height]" @click="onVolume">
          <div class="h-full bg-primary/60 rounded-full" :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }" />
        </div>
      </div>
      <div v-if="!compact" class="flex items-center gap-1">
        <button
          class="fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors"
          :class="player.equalizerVisible ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'"
          data-eq-toggle
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="ICON_SM.tall" />
          EQ
        </button>
        <button
          class="fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors"
          :class="player.queueVisible ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:text-base-content/70 hover:bg-base-content/10'"
          @click="player.toggleQueue"
        >
          <ListMusic :size="ICON_SM.tall" />
          {{ $t('queue.title') }}
        </button>
      </div>
    </div>

    <!-- ═══ MINIMAL (<180 × <140, ≥28px tall) ═══ -->
    <div v-else-if="mode === 'minimal'" class="flex flex-col items-center justify-center gap-0.5 w-full h-full overflow-hidden">
      <div v-if="widthSufficient" class="flex items-center justify-center gap-1.5 shrink-0">
        <button
          class="p-1 rounded-full transition-colors"
          :class="player.shuffle ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="ICON_SM.minimal" />
        </button>
        <button
          class="p-1 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          @click="player.prevTrack"
        >
          <SkipBack :size="ICON.minimal" fill="currentColor" />
        </button>
        <div class="relative">
          <div v-if="audio.isPlaying.value" class="absolute inset-0 rounded-full bg-primary/15 blur-md" />
          <button
            :class="PLAY_BOX.minimal"
            class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
            @click="togglePlay"
          >
            <Pause v-if="audio.isPlaying.value" :size="PLAY_SIZE.minimal" class="text-primary" fill="currentColor" />
            <Play v-else :size="PLAY_SIZE.minimal" class="text-primary ml-0.5" fill="currentColor" />
          </button>
        </div>
        <button
          class="p-1 rounded-full text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          @click="player.nextTrack"
        >
          <SkipForward :size="ICON.minimal" fill="currentColor" />
        </button>
        <button
          class="p-1 rounded-full transition-colors"
          :class="player.repeat !== 'none' ? 'text-primary' : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="ICON_SM.minimal" />
        </button>
      </div>
      <button
        v-else
        :class="PLAY_BOX.minimal"
        class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shrink-0"
        @click="togglePlay"
      >
        <Pause v-if="audio.isPlaying.value" :size="PLAY_SIZE.minimal" class="text-primary" fill="currentColor" />
        <Play v-else :size="PLAY_SIZE.minimal" class="text-primary ml-0.5" fill="currentColor" />
      </button>
      <div v-if="!compact && !widthSufficient && volumeFit" class="flex items-center gap-1 w-full max-w-[90px] px-1 justify-center shrink-0">
        <button class="text-base-content/50 hover:text-base-content transition-colors shrink-0" @click="player.toggleMute">
          <VolumeX v-if="player.isMuted" :size="ICON_SM.minimal" />
          <Volume2 v-else :size="ICON_SM.minimal" />
        </button>
        <div class="flex-1 min-w-0 h-0.5 bg-base-content/20 rounded-full cursor-pointer hover:h-1 transition-[height]" @click="onVolume">
          <div class="h-full bg-primary/60 rounded-full" :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }" />
        </div>
      </div>
    </div>

    <!-- ═══ MICRO (<28px tall) — only the play button ═══ -->
    <div v-else class="flex items-center justify-center w-full h-full p-0.5 overflow-hidden">
      <button
        :class="PLAY_BOX.micro"
        class="relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shrink-0"
        @click="togglePlay"
      >
        <Pause v-if="audio.isPlaying.value" :size="PLAY_SIZE.micro" class="text-primary" fill="currentColor" />
        <Play v-else :size="PLAY_SIZE.micro" class="text-primary ml-0.5" fill="currentColor" />
      </button>
    </div>
  </div>
</template>
