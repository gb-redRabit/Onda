<script setup lang="ts">
import { ref, computed } from 'vue'
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
  Sparkles
} from '@lucide/vue'
import { usePlayerStore } from '@renderer/stores/player'
import { useSettingsStore } from '@renderer/stores/settings'
import { formatDuration } from '@renderer/utils/formatters'
import SubtitleTrackSelector from './SubtitleTrackSelector.vue'

const props = defineProps<{
  showControls: boolean
  speed: number
}>()

const emit = defineEmits<{
  seek: [time: number]
  volumeChange: [value: number]
  setSpeed: [speed: number]
  skip: [seconds: number]
}>()

const player = usePlayerStore()
const settings = useSettingsStore()
const showFilters = ref(false)

const progressPct = computed(() =>
  player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0
)

const videoFilters = [
  { id: 'none', label: 'Brak', css: 'none' },
  { id: 'grayscale', label: 'Czarno-biale', css: 'grayscale(100%)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(80%)' },
  { id: 'contrast', label: 'Wysoki kontrast', css: 'contrast(150%)' },
  { id: 'brightness', label: 'Jasnosc +50%', css: 'brightness(150%)' },
  { id: 'saturate', label: 'Nasycenie +200%', css: 'saturate(200%)' },
  { id: 'invert', label: 'Inwersja', css: 'invert(100%)' },
  { id: 'blur', label: 'Rozmycie 2px', css: 'blur(2px)' },
  { id: 'hue-rotate', label: 'Obrót kolorow 90°', css: 'hue-rotate(90deg)' }
]

const speedSteps = [0.2, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

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

function setFilter(filter: (typeof videoFilters)[0]) {
  settings.updatePlayback({ videoFilter: filter.css })
  showFilters.value = false
}

function cycleSpeed(direction: number) {
  const currentIdx = speedSteps.indexOf(props.speed)
  if (currentIdx >= 0) {
    const nextIdx = Math.max(0, Math.min(speedSteps.length - 1, currentIdx + direction))
    emit('setSpeed', speedSteps[nextIdx])
  } else {
    const newSpeed =
      Math.round(Math.max(0.2, Math.min(3, props.speed + direction * 0.25)) * 10) / 10
    emit('setSpeed', newSpeed)
  }
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

      <!-- center: time + speed + skip buttons -->
      <div class="flex items-center gap-3">
        <!-- skip back 10s -->
        <button class="text-white/50 hover:text-white transition-colors" @click="emit('skip', -10)">
          <ChevronLeft :size="16" />
          <span class="text-[9px] absolute -mt-3 ml-0.5">10</span>
        </button>

        <div class="flex items-center gap-3 text-white/60 text-xs font-mono tabular-nums">
          <span>{{ formatDuration(player.currentTime) }}</span>
          <span class="text-white/30">/</span>
          <span>{{ formatDuration(player.duration) }}</span>
        </div>

        <!-- speed -->
        <div class="relative flex items-center">
          <button
            class="text-white/30 hover:text-white/60 transition-colors px-0.5"
            @click.stop="cycleSpeed(-1)"
          >
            <ChevronLeft :size="10" />
          </button>
          <button
            class="flex items-center gap-1 px-1.5 py-1 rounded-lg text-xs font-mono transition-colors"
            :class="
              speed !== 1 ? 'text-accent-base bg-accent-ghost' : 'text-white/50 hover:text-white'
            "
            @click.stop="cycleSpeed(1)"
          >
            <Gauge :size="12" />
            {{ speed }}x
          </button>
          <button
            class="text-white/30 hover:text-white/60 transition-colors px-0.5"
            @click.stop="cycleSpeed(1)"
          >
            <ChevronRight :size="10" />
          </button>
        </div>

        <!-- skip forward 10s -->
        <button class="text-white/50 hover:text-white transition-colors" @click="emit('skip', 10)">
          <ChevronRight :size="16" />
          <span class="text-[9px] absolute -mt-3 ml-0.5">10</span>
        </button>
      </div>

      <!-- right side: filters, eq, queue, subs, volume -->
      <div class="flex items-center gap-2">
        <!-- filters -->
        <div class="relative">
          <button
            class="text-white/50 hover:text-white transition-colors"
            :class="{ '!text-accent-base': settings.playback.videoFilter !== 'none' }"
            @click="showFilters = !showFilters"
          >
            <Sparkles :size="14" />
          </button>
          <Transition name="menu-fade">
            <div
              v-if="showFilters"
              class="absolute bottom-full right-0 mb-2 w-44 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/50 py-1.5 z-50"
            >
              <div
                class="px-3 py-1.5 text-[10px] text-fg-faint font-medium uppercase tracking-wider"
              >
                Filtry wideo
              </div>
              <button
                v-for="f in videoFilters"
                :key="f.id"
                class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
                :class="{ 'text-accent-base': settings.playback.videoFilter === f.css }"
                @click="setFilter(f)"
              >
                <span
                  class="w-3 h-3 rounded-full border border-border-default shrink-0"
                  :class="
                    settings.playback.videoFilter === f.css
                      ? 'bg-accent-base border-accent-base'
                      : ''
                  "
                />
                {{ f.label }}
              </button>
            </div>
          </Transition>
        </div>

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
