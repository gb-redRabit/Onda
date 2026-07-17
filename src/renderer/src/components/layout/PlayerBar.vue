<script setup lang="ts">
import { computed, ref } from 'vue'
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
  Music2,
  SlidersHorizontal,
  Minimize2
} from '@lucide/vue'
import { usePlayerStore } from '@renderer/stores/player'
import { useMediaPlayer } from '@renderer/composables/useMediaPlayer'
import { formatDuration } from '@renderer/utils/formatters'

const player = usePlayerStore()
const { seek: seekAudio, setVolume } = useMediaPlayer()
const isMini = ref(false)

const progressPct = computed(() =>
  player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0
)

function onSeek(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  const time = ((e.clientX - rect.left) / rect.width) * player.duration
  player.seek(time)
  seekAudio(time)
}

function onVolume(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  setVolume((e.clientX - rect.left) / rect.width)
}
</script>

<template>
  <!-- mini player -->
  <div
    v-if="isMini"
    class="h-12 bg-bg-overlay border-t border-border-default flex items-center px-3 gap-3 shrink-0 relative"
  >
    <div
      class="absolute top-0 left-0 right-0 h-0.5 bg-border-default/50 cursor-pointer group hover:h-1 transition-all z-10"
      @click="onSeek"
    >
      <div class="h-full bg-accent-base rounded-r-full" :style="{ width: progressPct + '%' }" />
    </div>

    <div class="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center shrink-0">
      <Music2 :size="14" :class="player.currentTrack ? 'text-accent-base' : 'text-fg-faint'" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="text-xs font-medium truncate">
        {{ player.currentTrack?.metadata?.title || player.currentTrack?.name || 'Brak utworu' }}
      </div>
    </div>
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 text-fg-muted hover:text-fg-base transition-colors"
        @click="player.prevTrack"
      >
        <SkipBack :size="14" fill="currentColor" />
      </button>
      <button
        class="w-8 h-8 rounded-full bg-fg-base flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        @click="player.togglePlay"
      >
        <Pause v-if="player.isPlaying" :size="14" class="text-bg-base" fill="currentColor" />
        <Play v-else :size="14" class="text-bg-base ml-0.5" fill="currentColor" />
      </button>
      <button
        class="p-1.5 text-fg-muted hover:text-fg-base transition-colors"
        @click="player.nextTrack"
      >
        <SkipForward :size="14" fill="currentColor" />
      </button>
    </div>
    <span class="text-[10px] text-fg-faint font-mono tabular-nums">{{
      formatDuration(player.currentTime)
    }}</span>
    <button
      class="p-1.5 text-fg-faint hover:text-fg-base transition-colors"
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
      class="absolute top-0 left-0 right-0 h-1 bg-border-default/50 cursor-pointer group hover:h-1.5 transition-all z-10"
      @click="onSeek"
    >
      <div class="h-full bg-accent-base rounded-r-full" :style="{ width: progressPct + '%' }" />
    </div>

    <div class="flex items-center gap-3 w-70 min-w-0">
      <div
        class="w-11 h-11 rounded-lg bg-bg-elevated border border-border-default flex items-center justify-center shrink-0 overflow-hidden"
      >
        <Music2 v-if="!player.currentTrack" :size="18" class="text-fg-faint" />
        <Music2 v-else :size="18" class="text-accent-base" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-fg-base truncate">
          {{
            player.currentTrack?.metadata?.title ||
            player.currentTrack?.name ||
            'Nie załadowano utworu'
          }}
        </div>
        <div class="text-xs text-fg-faint truncate">
          {{ player.currentTrack?.metadata?.artist || 'Wybierz utwór' }}
        </div>
      </div>
      <button class="shrink-0 p-1.5 text-fg-faint hover:text-red-base transition-colors">
        <Heart :size="15" />
      </button>
    </div>

    <div class="flex-1 flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-3">
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :class="{ '!text-accent-base': player.shuffle }"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="15" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          @click="player.prevTrack"
        >
          <SkipBack :size="17" fill="currentColor" />
        </button>
        <button
          class="w-10 h-10 rounded-full bg-fg-base flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
          @click="player.togglePlay"
        >
          <Pause v-if="player.isPlaying" :size="18" class="text-bg-base" fill="currentColor" />
          <Play v-else :size="18" class="text-bg-base ml-0.5" fill="currentColor" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          @click="player.nextTrack"
        >
          <SkipForward :size="17" fill="currentColor" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :class="{ '!text-accent-base': player.repeat !== 'none' }"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="15" />
        </button>
      </div>
      <div class="flex items-center gap-2 text-[11px] text-fg-faint font-mono tabular-nums">
        <span>{{ formatDuration(player.currentTime) }}</span>
        <span>/</span>
        <span>{{ formatDuration(player.duration) }}</span>
      </div>
    </div>

    <div class="flex items-center gap-1.5 w-55 justify-end">
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        :class="{ '!text-accent-base': player.equalizerVisible }"
        @click="player.toggleEqualizer"
      >
        <SlidersHorizontal :size="15" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        :class="{ '!text-accent-base': player.queueVisible }"
        @click="player.toggleQueue"
      >
        <ListMusic :size="15" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
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
        class="w-24 h-1 bg-border-default/60 rounded-full cursor-pointer hover:h-1.5 transition-all"
        @click="onVolume"
      >
        <div
          class="h-full bg-fg-base rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
        title="Mini odtwarzacz"
        @click="isMini = true"
      >
        <Minimize2 :size="13" />
      </button>
    </div>
  </div>
</template>
