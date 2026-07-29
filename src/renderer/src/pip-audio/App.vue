<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface PipUpdate {
  mode?: string
  state?: PipState
  opacity?: number
  cssVars?: Record<string, string>
}

interface PipState {
  trackName: string
  artist: string
  coverData: string | null
  coverType?: 'image' | 'video' | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted?: boolean
  shuffle?: boolean
  repeat?: 'none' | 'all' | 'one'
  equalizerBands?: number[]
  equalizerPreset?: string
  vizData?: number[]
  nextTrackName?: string
  nextTrackArtist?: string
}

const eqPresets = [
  { id: 'flat', label: 'Flat' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Classical' },
  { id: 'bassBoost', label: 'Bass' },
  { id: 'trebleBoost', label: 'Treble' },
  { id: 'vocal', label: 'Vocal' }
]

const api = window.api

const trackName = ref('—')
const artist = ref('')
const coverData = ref<string | null>(null)
const coverType = ref<'image' | 'video' | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const shuffle = ref(false)
const repeat = ref<'none' | 'all' | 'one'>('none')
const equalizerBands = ref<number[]>([])
const eqPreset = ref('flat')
const vizData = ref<number[]>([])
const nextTrackName = ref('')
const nextTrackArtist = ref('')
const mode = ref<'m' | 'd' | 'x' | 'w'>('m')
const bgAlpha = ref(0.85)
const hover = ref(false)

function fmt(t: number): string {
  if (typeof t !== 'number' || t < 0 || isNaN(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return m + ':' + (s < 10 ? '0' : '') + s
}

const progressPct = computed(() => {
  const d = duration.value > 0 ? duration.value : 0
  return d > 0 ? Math.min((currentTime.value / d) * 100, 100) : 0
})

const volPct = computed(() => Math.round(volume.value * 100) + '%')
const volLabel = computed(() => isMuted.value ? 'MUT' : 'VOL')

const isVideoCover = computed(() => coverType.value === 'video' && !!coverData.value)
const videoCoverSrc = computed(() => {
  if (coverType.value !== 'video' || !coverData.value) return ''
  return `${api?.mediaServerUrl || ''}/?path=${encodeURIComponent(coverData.value.replace(/\\/g, '/'))}`
})

const pipAlpha = computed(() => {
  const a = bgAlpha.value
  return hover.value ? 0.92 : Math.min(0.85, a * 0.65)
})

function showMain() {
  if (api) {
    api.send('audio-pip:showMain')
  } else {
    // fallback: try direct IPC
    try { (window as any).electron?.ipcRenderer?.send('audio-pip:showMain') } catch {}
  }
}

function send(action: string) {
  api?.send('audio-pip:action', action)
}

function onProgressClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const r = bar.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  api?.send('audio-pip:progressClick', pct)
}

function onVolumeInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  send('volume:' + v.toFixed(2))
}

function selectEqPreset(name: string) {
  eqPreset.value = name
  send('eqPreset:' + name)
}

// canvas visualization (high-performance)
const vizCanvas = ref<HTMLCanvasElement | null>(null)
let vizAnimId = 0
let vizSmooth: number[] = Array(10).fill(0)
let vizPeaks: number[] = Array(10).fill(0)
let cachedAccent = '#7c6aef'
let barGeom: { x: number; bw: number }[] = []
let cachedW = 0
let cachedCount = 0

function ensureGeom(w: number, count: number) {
  if (w === cachedW && count === cachedCount && barGeom.length === count) return
  const barW = w / count
  const gap = 0.5
  barGeom = Array.from({ length: count }, (_, i) => ({
    x: i * barW + gap / 2,
    bw: Math.max(1, barW - gap)
  }))
  cachedW = w
  cachedCount = count
}

function drawViz() {
  const canvas = vizCanvas.value
  if (!canvas || !canvas.isConnected) {
    vizAnimId = requestAnimationFrame(drawViz)
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    vizAnimId = requestAnimationFrame(drawViz)
    return
  }
  const parent = canvas.parentElement
  if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
    canvas.width = parent.clientWidth
    canvas.height = parent.clientHeight
  }
  const w = canvas.width
  const h = canvas.height
  const data = vizData.value
  if (data.length < 4) {
    vizAnimId = requestAnimationFrame(drawViz)
    return
  }

  const accent = cachedAccent
  const count = 192
  ensureGeom(w, count)
  const cx = h / 2

  if (vizSmooth.length !== count) {
    vizSmooth = Array(count).fill(0)
  }
  let peaks = vizPeaks
  if (peaks.length !== count) {
    peaks = vizPeaks = Array(count).fill(0)
  }

  for (let i = 0; i < count; i++) {
    const fi = (i / count) * (data.length - 1)
    const idx0 = Math.floor(fi)
    const idx1 = Math.min(idx0 + 1, data.length - 1)
    const frac = fi - idx0
    const v0 = data[idx0] / 255
    const v1 = data[idx1] / 255
    const t = frac * frac * (3 - 2 * frac)
    const target = v0 + (v1 - v0) * t

    if (target > vizSmooth[i]) {
      vizSmooth[i] += (target - vizSmooth[i]) * 0.45
    } else {
      vizSmooth[i] += (target - vizSmooth[i]) * 0.06
    }

    if (vizSmooth[i] > peaks[i]) {
      peaks[i] = vizSmooth[i]
    } else {
      peaks[i] -= 0.008
      if (peaks[i] < 0) peaks[i] = 0
    }
  }

  ctx.clearRect(0, 0, w, h)

  // draw glow pass (wider, semi-transparent)
  ctx.globalAlpha = 0.15
  for (let i = 0; i < count; i++) {
    if (vizSmooth[i] < 0.01) continue
    const barH = vizSmooth[i] * cx * 0.95
    const { x, bw } = barGeom[i]
    ctx.fillStyle = accent
    ctx.fillRect(x - 1, cx - barH - 1, bw + 2, barH * 2 + 2)
  }

  // draw solid bars
  ctx.globalAlpha = 1
  for (let i = 0; i < count; i++) {
    if (vizSmooth[i] < 0.01) continue
    const barH = vizSmooth[i] * cx * 0.95
    const { x, bw } = barGeom[i]
    ctx.fillStyle = accent
    ctx.fillRect(x, cx - barH, bw, barH * 2)
  }

  // draw bright center line (fake gradient)
  ctx.globalAlpha = 0.5
  for (let i = 0; i < count; i++) {
    if (vizSmooth[i] < 0.01) continue
    const barH = vizSmooth[i] * cx * 0.95
    const { x, bw } = barGeom[i]
    ctx.fillStyle = '#a5b4fc'
    ctx.fillRect(x, cx - barH * 0.15, bw, barH * 0.3)
  }

  // peak dots
  ctx.globalAlpha = 0.8
  ctx.fillStyle = accent
  for (let i = 0; i < count; i++) {
    if (peaks[i] < 0.015) continue
    const { x, bw } = barGeom[i]
    const py = cx - peaks[i] * cx * 0.95
    ctx.fillRect(x + bw / 2 - 1, py - 1, 2, 2)
    ctx.fillRect(x + bw / 2 - 1, cx * 2 - py - 1, 2, 2)
  }

  ctx.globalAlpha = 1

  vizAnimId = requestAnimationFrame(drawViz)
}

let cleanup: (() => void) | null = null

function applyCssVars(vars: Record<string, string> | undefined) {
  if (!vars) return
  const root = document.documentElement
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val)
  }
}

onMounted(() => {
  vizAnimId = requestAnimationFrame(drawViz)
  if (!api) return
  const cleanup1 = api.on('audio-pip:update', (...args: unknown[]) => {
    const d = args[0] as PipUpdate | undefined
    if (!d) return
    if (d.mode) {
      mode.value = d.mode === 'max' ? 'x' : d.mode === 'medium' ? 'd' : d.mode === 'wide' ? 'w' : 'm'
    }
    if (d.state) {
      const s = d.state
      trackName.value = s.trackName || '—'
      artist.value = s.artist || ''
      coverData.value = s.coverData || null
      coverType.value = s.coverType || (s.coverData ? 'image' : null)
      isPlaying.value = !!s.isPlaying
      currentTime.value = typeof s.currentTime === 'number' ? s.currentTime : 0
      duration.value = typeof s.duration === 'number' ? s.duration : 0
      volume.value = typeof s.volume === 'number' ? s.volume : 1
      isMuted.value = !!s.isMuted
      shuffle.value = !!s.shuffle
      repeat.value = s.repeat || 'none'
      if (s.equalizerBands) equalizerBands.value = s.equalizerBands
      if (s.equalizerPreset) eqPreset.value = s.equalizerPreset
      nextTrackName.value = s.nextTrackName || ''
      nextTrackArtist.value = s.nextTrackArtist || ''
    }
    if (typeof d.opacity === 'number') bgAlpha.value = d.opacity
    if (d.cssVars) applyCssVars(d.cssVars)
  })
  const cleanup2 = api.on('audio-pip:vizData', (...args: unknown[]) => {
    const d = args[0] as number[]
    if (d && d.length > 0) vizData.value = d
  })
  const cleanup3 = api.on('audio-pip:theme', (...args: unknown[]) => {
    applyCssVars(args[0] as Record<string, string>)
    cachedAccent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-base').trim() || '#7c6aef'
  })
  cleanup = () => { cleanup1(); cleanup2(); cleanup3() }
})

onUnmounted(() => {
  cancelAnimationFrame(vizAnimId)
  vizAnimId = 0
  cleanup?.()
})
</script>

<template>
  <div class="fixed inset-0 z-0 transition-opacity duration-300 select-none bg-bg-base" :style="{ opacity: pipAlpha }"></div>

  <div class="relative z-10 flex flex-col w-full h-full select-none" @mouseenter="hover = true" @mouseleave="hover = false" @dblclick="showMain">
    <!-- Minimal -->
    <template v-if="mode === 'm'">
      <div class="flex flex-row items-center h-full px-1.5 gap-1">
            <span class="text-[11px] font-medium truncate flex-1 min-w-0 text-fg-base">{{ trackName }}</span>
        <div class="flex items-center gap-0.5 shrink-0">
          <button class="btn-pip w-5 h-5" @click="send('prev')">&#x23EE;</button>
          <button class="btn-pip btn-play w-5 h-5" @click="send('playPause')">{{ isPlaying ? '\u23F8' : '\u25B6' }}</button>
          <button class="btn-pip w-5 h-5" @click="send('next')">&#x23ED;</button>
          <button class="btn-pip w-4.5 h-4.5 text-[10px] text-fg-faint" @click="send('cycleMode')">&#x229E;</button>
        </div>
      </div>
    </template>

    <!-- Medium -->
    <template v-else-if="mode === 'd'">
      <div class="flex flex-1 items-stretch">
        <div class="flex shrink-0 pt-3 pb-1 pl-2">
          <video v-if="isVideoCover" :src="videoCoverSrc" class="w-19 h-19 rounded-lg object-cover block" autoplay muted loop playsinline />
          <img v-else-if="coverData" :src="coverData" class="w-19 h-19 rounded-lg object-cover block" alt="" />
          <div v-else class="w-19 h-19 rounded-lg bg-bg-hover"></div>
        </div>
        <div class="flex flex-1 justify-center min-w-0 flex-col pt-1 pl-2.5 gap-0.5">
          <div class="text-xs font-semibold truncate text-fg-base">{{ trackName }}</div>
          <div class="text-[10px] text-fg-faint truncate">{{ artist }}</div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(currentTime) }}</span>
            <span class="text-[10px] text-fg-faint opacity-40">/</span>
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(duration) }}</span>
        </div>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 shrink-0 pr-2.5 pt-5" >
          <div>
            <span class="text-[9px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover" @click="send('mute')">{{ volLabel }}</span>
            <input type="range" class="w-max h-0.75" min="0" max="1" step="0.05" :value="volume" @input="onVolumeInput" />
            <span class="text-[10px] text-fg-faint min-w-6 text-right">{{ volPct }}</span>
          </div>
          <div class="flex items-center justify-center px-2.5 pb-1.5 pt-0.5 gap-0.5 shrink-0 h-8">
            <button class="btn-pip" :class="{ '!text-accent-base': shuffle }" @click="send('shuffle')">&#x21C4;</button>
            <button class="btn-pip" @click="send('prev')">&#x23EE;</button>
            <button class="btn-pip btn-play" @click="send('playPause')">{{ isPlaying ? '\u23F8' : '\u25B6' }}</button>
            <button class="btn-pip" @click="send('next')">&#x23ED;</button>
            <button class="btn-pip" :class="{ '!text-accent-base': repeat !== 'none' }" @click="send('repeat')"><span class="relative">&#x21BB;<span v-if="repeat === 'one'" class="absolute inset-0 flex items-center justify-center text-[8px] font-bold">1</span></span></button>
          </div>
        </div>
      </div>
      <div class="absolute top-1 right-1 z-10">
        <button class="btn-pip w-4.5 h-4.5 text-[10px] text-fg-faint" @click="send('cycleMode')">&#x229E;</button>
      </div>
    </template>

    <!-- Max -->
    <template v-else-if="mode === 'x'">
      <!-- canvas visualization -->
      <canvas ref="vizCanvas" class="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-40"></canvas>

      <div class="relative z-10 flex items-stretch h-full pr-12">
        <div class="flex items-center gap-2 pl-2.5 min-w-0 shrink-0">
          <video v-if="isVideoCover" :src="videoCoverSrc" class="w-17 h-17 rounded-lg object-cover block shrink-0" autoplay muted loop playsinline />
          <img v-else-if="coverData" :src="coverData" class="w-17 h-17 rounded-lg object-cover block shrink-0" alt="" />
          <div v-else class="w-17 h-17 rounded-lg bg-bg-hover shrink-0"></div>
          <div class="flex flex-col min-w-0 gap-0.5">
            <div class="text-[14px] font-semibold truncate text-fg-base max-w-44">{{ trackName }}</div>
            <div class="text-[11px] text-fg-faint truncate max-w-44">{{ artist }}</div>
            <div v-if="nextTrackName" class="text-[10px] text-fg-faint truncate max-w-44">
              &#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' \u2014 ' + nextTrackArtist : '' }}
            </div>
          </div>
        </div>

        <div class="absolute inset-x-0 top-0 bottom-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none">
          <div class="flex items-center gap-1.5 pointer-events-auto">
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(currentTime) }}</span>
            <span class="text-[10px] text-fg-faint opacity-40">/</span>
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(duration) }}</span>
          </div>
          <div class="flex items-center gap-1 pointer-events-auto">
            <button class="btn-pip w-5.5 h-5.5" :class="{ '!text-accent-base': shuffle }" @click="send('shuffle')">&#x21C4;</button>
            <button class="btn-pip w-5.5 h-5.5" @click="send('prev')">&#x23EE;</button>
            <button class="btn-pip btn-play w-5.5 h-5.5" @click="send('playPause')">{{ isPlaying ? '\u23F8' : '\u25B6' }}</button>
            <button class="btn-pip w-5.5 h-5.5" @click="send('next')">&#x23ED;</button>
            <button class="btn-pip w-5.5 h-5.5" :class="{ '!text-accent-base': repeat !== 'none' }" @click="send('repeat')">&#x21BB;<span v-if="repeat === 'one'" class=" text-[8px] ml-[-1px]">1</span></button>
          </div>
        </div>

        <div class="flex flex-col items-end justify-center gap-1 pr-3 ml-auto shrink-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover" @click="send('mute')">{{ volLabel }}</span>
            <input type="range" class="w-13.5 h-0.75" min="0" max="1" step="0.05" :value="volume" @input="onVolumeInput" />
            <span class="text-[10px] text-fg-faint min-w-5 text-right tabular-nums">{{ volPct }}</span>
          </div>
          <div class="flex items-center gap-1">
            <button v-for="p in eqPresets" :key="p.id"
              class="text-[9px] px-1.5 py-0.5 rounded transition-colors"
              :class="eqPreset===p.id ? 'bg-accent-base text-white' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
              @click="selectEqPreset(p.id)"
            >{{ p.label }}</button>
          </div>
        </div>
      </div>

      <div class="absolute top-0.5 right-1 z-20">
        <button class="btn-pip w-4 h-4 text-[9px] text-fg-faint" @click="send('cycleMode')" title="Cycle mode">&#x229E;</button>
      </div>
    </template>

    <!-- Wide (full-width thin bar) -->
    <template v-else>
      <div class="flex items-center h-full px-1.5 gap-1">
        <span class="text-[11px] font-medium truncate flex-1 min-w-0 text-fg-base">{{ trackName }}</span>
        <div class="flex items-center gap-0.5 shrink-0">
          <button class="btn-pip w-4.5 h-4.5 text-[9px]" :class="{ '!text-accent-base': shuffle }" @click="send('shuffle')">&#x21C4;</button>
          <button class="btn-pip w-4.5 h-4.5" @click="send('prev')">&#x23EE;</button>
          <button class="btn-pip btn-play w-4.5 h-4.5" @click="send('playPause')">{{ isPlaying ? '\u23F8' : '\u25B6' }}</button>
          <button class="btn-pip w-4.5 h-4.5" @click="send('next')">&#x23ED;</button>
          <button class="btn-pip w-4.5 h-4.5 text-[9px]" :class="{ '!text-accent-base': repeat !== 'none' }" @click="send('repeat')"><span class="relative">&#x21BB;<span v-if="repeat === 'one'" class="absolute inset-0 flex items-center justify-center text-[8px] font-bold">1</span></span></button>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 ml-1">
          <span class="text-[9px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(currentTime) }}</span>
          <span class="text-[9px] text-fg-faint opacity-40">/</span>
          <span class="text-[9px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(duration) }}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0 ml-1">
          <span class="text-[8px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover" @click="send('mute')">{{ volLabel }}</span>
          <input type="range" class="w-10 h-0.75" min="0" max="1" step="0.05" :value="volume" @input="onVolumeInput" />
          <span class="text-[9px] text-fg-faint min-w-5 text-right tabular-nums">{{ volPct }}</span>
        </div>
        <div class="flex items-center gap-0.5 shrink-0 ml-1">
          <button v-for="p in eqPresets.slice(0,4)" :key="p.id"
            class="text-[8px] px-1 py-0.5 rounded transition-colors"
            :class="eqPreset===p.id ? 'bg-accent-base text-white' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
            @click="selectEqPreset(p.id)"
          >{{ p.label }}</button>
        </div>
        <button class="btn-pip w-3.5 h-3.5 text-[8px] text-fg-faint ml-0.5" @click="send('cycleMode')" title="Cycle mode">&#x229E;</button>
      </div>
    </template>
  </div>

  <div class="fixed bottom-0 left-0 right-0 h-0.75 bg-bg-hover cursor-pointer z-20 hover:h-1.5 hover:bg-bg-active transition-all duration-150" @click="onProgressClick">
    <div class="h-full bg-accent-base w-0 rounded-r transition-[width]" :style="{ width: progressPct + '%' }"></div>
  </div>
</template>

