<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { usePlayerStore } from '@renderer/stores/player'
import { useSettingsStore } from '@renderer/stores/settings'
import { useRouter } from 'vue-router'
import PlayerOSD from '@renderer/components/player/PlayerOSD.vue'
import PlayerTopBar from '@renderer/components/player/PlayerTopBar.vue'
import PlayerControls from '@renderer/components/player/PlayerControls.vue'
import {
  initSubtitleRenderer,
  loadSubtitleTrack,
  removeSubtitleTrack,
  applySubtitleSettings,
  disableSubtitleOverride,
  destroySubtitleRenderer
} from '@renderer/composables/useSubtitleRenderer'

const player = usePlayerStore()
const settings = useSettingsStore()
const router = useRouter()

const videoRef = ref<HTMLVideoElement | null>(null)
const playerContainerRef = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)
const showControls = ref(true)
const controlsTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const osdVisible = ref(false)
const osdText = ref('')
const osdIcon = ref<'play' | 'pause' | 'volume' | 'seek' | 'track'>('track')
const osdTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const isVideo = computed(() => player.currentTrack?.type === 'video')

function showOSD(text: string, icon: typeof osdIcon.value = 'track', duration = 1500) {
  osdText.value = text
  osdIcon.value = icon
  osdVisible.value = true
  if (osdTimeout.value) clearTimeout(osdTimeout.value)
  osdTimeout.value = setTimeout(() => {
    osdVisible.value = false
  }, duration)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!videoRef.value) return
  const delta = e.deltaY < 0 ? 0.05 : -0.05
  const newVol = Math.max(0, Math.min(1, player.volume + delta))
  player.setVolume(newVol)
  videoRef.value.volume = player.isMuted ? 0 : newVol
  showOSD(`Głośność: ${Math.round(newVol * 100)}%`, 'volume', 1200)
}

function onSeek(time: number) {
  if (!videoRef.value) return
  player.seek(time)
  videoRef.value.currentTime = time
}

function onVolumeChange(value: number) {
  player.setVolume(value)
  if (videoRef.value) videoRef.value.volume = player.isMuted ? 0 : value
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const target = playerContainerRef.value || document.documentElement
    target.requestFullscreen().catch(() => {
      document.documentElement.requestFullscreen()
    })
  } else {
    document.exitFullscreen()
  }
}

async function togglePiP() {
  if (player.pipActive) {
    window.api.pipStop()
    return
  }
  let src = videoRef.value?.src || ''
  if (!src && player.currentTrack) {
    src = `file:///${player.currentTrack.path.replace(/\\/g, '/')}`
  }
  if (!src) return
  const pipSettings = {
    position: settings.playback.pipPosition,
    width: settings.playback.pipWidth,
    height: settings.playback.pipHeight,
    startTime: videoRef.value?.currentTime || player.currentTime
  }
  const started = await window.api.pipStart(src, pipSettings)
  if (started) {
    player.pipTime = videoRef.value?.currentTime || player.currentTime
    player.pipActive = true
    if (videoRef.value) {
      videoRef.value.pause()
    }
    player.isPlaying = false
  }
}

function onMouseMove() {
  showControls.value = true
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value)
  controlsTimeout.value = setTimeout(() => {
    if (player.isPlaying) showControls.value = false
  }, 3000)
}

let clickTimer: ReturnType<typeof setTimeout> | null = null

function handleClick() {
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
    toggleFullscreen()
    return
  }
  clickTimer = setTimeout(() => {
    player.togglePlay()
    showOSD(
      player.isPlaying ? 'Odtwarzanie' : 'Wstrzymano',
      player.isPlaying ? 'play' : 'pause',
      1000
    )
    clickTimer = null
  }, 250)
}

const videoEventsConnected = ref(false)

function connectVideoEvents(el: HTMLVideoElement) {
  if (videoEventsConnected.value) return
  videoEventsConnected.value = true
  el.addEventListener('timeupdate', () => {
    player.currentTime = el.currentTime
  })
  el.addEventListener('durationchange', () => {
    player.duration = el.duration || 0
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0
  })
  el.addEventListener('loadedmetadata', () => {
    player.duration = el.duration || 0
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0
  })
  el.addEventListener('ended', () => {
    player.isPlaying = false
    player.nextTrack()
  })
}

function setupVideo(track: import('@renderer/types/media').MediaFile | null) {
  if (!track || track.type !== 'video' || !videoRef.value) return
  const el = videoRef.value
  const src = `file:///${track.path.replace(/\\/g, '/')}`
  if (el.getAttribute('data-src') !== src) {
    const seekTo = player.pipTime > 0 ? player.pipTime : player.currentTime
    if (player.pipTime > 0) player.pipTime = 0
    el.setAttribute('data-src', src)
    el.src = src
    connectVideoEvents(el)
    el.addEventListener(
      'loadedmetadata',
      () => {
        if (seekTo > 0) {
          el.currentTime = seekTo
        }
        if (player.isPlaying) el.play().catch(() => {})
      },
      { once: true }
    )
    el.load()
  } else {
    el.volume = player.isMuted ? 0 : player.volume
    if (player.isPlaying) el.play().catch(() => {})
  }
}

let lastLoadedPath = ''

function onVideoRef(el: unknown) {
  videoRef.value = el as HTMLVideoElement
  if (el && player.currentTrack?.type === 'video') {
    setupVideo(player.currentTrack)
    const video = el as HTMLVideoElement
    const tryInit = () => {
      if (!video.isConnected) {
        nextTick(tryInit)
        return
      }
      initSubtitleRenderer(video)
      if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
        if (video.readyState >= 1 || video.videoWidth > 0) {
          lastLoadedPath = player.currentTrack.path
          player.loadSubtitles(player.currentTrack.path)
        } else {
          video.addEventListener('loadedmetadata', () => {
            if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
              lastLoadedPath = player.currentTrack.path
              player.loadSubtitles(player.currentTrack.path)
            }
          }, { once: true })
        }
      }
    }
    tryInit()
  }
}

watch(
  () => player.currentTrack,
  (track) => {
    if (track?.type === 'video' && track.path !== lastLoadedPath) {
      lastLoadedPath = track.path
      player.loadSubtitles(track.path)
    }
  }
)

watch(
  () => player.currentTrack,
  (track) => {
    if (!track) return
    if (track.type !== 'video') {
      router.back()
      return
    }
    setupVideo(track)
    if (player.pipActive && track.type === 'video') {
      const src = `file:///${track.path.replace(/\\/g, '/')}`
      window.api.pipUpdateSrc(src)
    }
    const title = track.metadata?.title || track.name
    const artist = track.metadata?.artist
    showOSD(artist ? `${artist} — ${title}` : title, 'track', 2500)
  },
  { flush: 'post' }
)

watch(
  () => player.isPlaying,
  (playing) => {
    if (!videoRef.value || !isVideo.value) return
    if (playing) videoRef.value.play().catch(() => {})
    else videoRef.value.pause()
  }
)

const pipCloseCleanup = ref<(() => void) | null>(null)

onMounted(() => {
  if (!player.currentTrack || player.currentTrack.type !== 'video') {
    router.replace('/')
    return
  }
  setupVideo(player.currentTrack)
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })

  pipCloseCleanup.value = window.api.on('pip:closed', (time: unknown) => {
    const savedTime = (time as number) || 0
    player.pipActive = false
    if (videoRef.value) {
      videoRef.value.currentTime = savedTime
      player.currentTime = savedTime
    }
    player.isPlaying = true
  })
})

onUnmounted(() => {
  pipCloseCleanup.value?.()
  destroySubtitleRenderer()
  player.clearSubtitles()
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value)
  if (osdTimeout.value) clearTimeout(osdTimeout.value)
  if (clickTimer) clearTimeout(clickTimer)
})

watch([() => player.volume, () => player.isMuted], () => {
  if (videoRef.value) videoRef.value.volume = player.isMuted ? 0 : player.volume
})

watch(
  () => player.activeSubtitleId,
  async (trackId) => {
    if (!trackId || !player.currentTrack) {
      removeSubtitleTrack()
      disableSubtitleOverride()
      return
    }
    const track = player.subtitleTracks.find((t) => t.id === trackId)
    if (!track) return

    if (track.source === 'embedded' && !track.content) {
      const result = await player.loadEmbeddedSubtitle(trackId, player.currentTrack.path)
      if (result) {
        track.content = result.content
        track.format = result.format
        track.fonts = result.fonts
        await loadSubtitleTrack(track)
        applySubtitleSettings(player.subtitleSettings)
      } else {
        console.error('[Subtitles] extraction returned null')
      }
    } else {
      await loadSubtitleTrack(track)
      applySubtitleSettings(player.subtitleSettings)
    }
  }
)

watch(
  () => ({ ...player.subtitleSettings }),
  (settings) => {
    if (player.activeSubtitleId) {
      applySubtitleSettings(settings)
    }
  },
  { deep: true }
)


</script>

<template>
  <div
    ref="playerContainerRef"
    class="player-container flex flex-col h-full bg-black relative"
    @mousemove="onMouseMove"
    @wheel.prevent="onWheel"
  >
    <PlayerOSD :visible="osdVisible" :text="osdText" :icon="osdIcon" />

    <PlayerTopBar
      :show-controls="showControls"
      :track="player.currentTrack"
      @back="router.back"
      @pip="togglePiP"
      @fullscreen="toggleFullscreen"
    />

    <div class="relative flex-1 flex items-center justify-center overflow-hidden">
      <video
        v-if="isVideo"
        :ref="onVideoRef"
        class="w-full h-full object-contain cursor-pointer"
        @click="handleClick"
      />
      <div v-if="!isVideo" class="text-center">
        <p class="text-lg text-white/60">Brak wideo do odtworzenia</p>
        <button
          class="mt-4 px-4 py-2 rounded-xl bg-accent-base text-white text-sm"
          @click="router.push('/explorer')"
        >
          Przeglądaj pliki
        </button>
      </div>
    </div>

    <PlayerControls :show-controls="showControls" @seek="onSeek" @volume-change="onVolumeChange" />
  </div>
</template>

<style scoped>
.player-container:fullscreen {
  width: 100vw;
  height: 100vh;
}
.player-container:fullscreen video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
