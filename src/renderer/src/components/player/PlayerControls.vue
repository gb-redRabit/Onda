<script setup lang="ts">
import { computed } from 'vue'
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
  SlidersHorizontal
} from '@lucide/vue'
import { usePlayerStore } from '@renderer/stores/player'
import { formatDuration } from '@renderer/utils/formatters'
import SubtitleTrackSelector from './SubtitleTrackSelector.vue'

defineProps<{
  showControls: boolean
}>()

const emit = defineEmits<{
  seek: [time: number]
  volumeChange: [value: number]
}>()

const player = usePlayerStore()

const progressPct = computed(() =>
  player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0
)

function onSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  emit('seek', pct * player.duration)
}

function onVolumeClick(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const v = (e.clientX - r.left) / r.width
  emit('volumeChange', v)
}
</script>

<template>
  <div
    class="absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-black/90 via-black/50 to-transparent pt-12 pb-6 px-6 transition-opacity"
    :class="{ 'opacity-0': !showControls }"
  >
    <!-- seek bar -->
    <div
      class="w-full h-1.5 bg-white/20 rounded-full cursor-pointer hover:h-2.5 transition-all mb-3"
      @click="onSeek"
    >
      <div
        class="h-full bg-accent-base rounded-full relative"
        :style="{ width: progressPct + '%' }"
      >
        <div
          class="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg opacity-0 hover:opacity-100 transition-opacity"
        />
      </div>
    </div>

    <div class="flex items-center justify-between">
      <!-- playback buttons -->
      <div class="flex items-center gap-3">
        <button
          class="text-white/50 hover:text-white transition-colors"
          :class="{ '!text-accent-base': player.shuffle }"
          @click="player.toggleShuffle"
        >
          <Shuffle :size="16" />
        </button>
        <button class="text-white/70 hover:text-white transition-colors" @click="player.prevTrack">
          <SkipBack :size="18" fill="currentColor" />
        </button>
        <button
          class="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
          @click="player.togglePlay"
        >
          <Pause v-if="player.isPlaying" :size="22" class="text-black" fill="currentColor" />
          <Play v-else :size="22" class="text-black ml-0.5" fill="currentColor" />
        </button>
        <button class="text-white/70 hover:text-white transition-colors" @click="player.nextTrack">
          <SkipForward :size="18" fill="currentColor" />
        </button>
        <button
          class="text-white/50 hover:text-white transition-colors"
          :class="{ '!text-accent-base': player.repeat !== 'none' }"
          @click="player.cycleRepeat"
        >
          <component :is="player.repeat === 'one' ? Repeat1 : Repeat" :size="16" />
        </button>
      </div>

      <!-- time display -->
      <div class="flex items-center gap-3 text-white/60 text-xs font-mono tabular-nums">
        <span>{{ formatDuration(player.currentTime) }}</span>
        <span class="text-white/30">/</span>
        <span>{{ formatDuration(player.duration) }}</span>
      </div>

      <!-- right side: eq, queue, volume -->
      <div class="flex items-center gap-2">
        <button
          class="text-white/50 hover:text-white transition-colors"
          :class="{ '!text-accent-base': player.equalizerVisible }"
          @click="player.toggleEqualizer"
        >
          <SlidersHorizontal :size="16" />
        </button>
        <button
          class="text-white/50 hover:text-white transition-colors"
          :class="{ '!text-accent-base': player.queueVisible }"
          @click="player.toggleQueue"
        >
          <ListMusic :size="16" />
        </button>
        <SubtitleTrackSelector />
        <button class="text-white/60 hover:text-white transition-colors" @click="player.toggleMute">
          <VolumeX v-if="player.isMuted" :size="18" />
          <Volume2 v-else :size="18" />
        </button>
        <div class="w-20 h-1 bg-white/20 rounded-full cursor-pointer" @click="onVolumeClick">
          <div
            class="h-full bg-white rounded-full"
            :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
