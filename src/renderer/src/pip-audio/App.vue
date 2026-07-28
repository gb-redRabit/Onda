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
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted?: boolean
  equalizerBands?: number[]
  nextTrackName?: string
  nextTrackArtist?: string
}

const api = window.api

const trackName = ref('—')
const artist = ref('')
const coverData = ref<string | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const equalizerBands = ref<number[]>([])
const nextTrackName = ref('')
const nextTrackArtist = ref('')
const mode = ref<'m' | 'd' | 'x'>('m')
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

const pipAlpha = computed(() => {
  const a = bgAlpha.value
  return hover.value ? 0.92 : Math.min(0.85, a * 0.65)
})

function showMain() {
  api?.send('audio-pip:showMain')
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

function eqHtml(bands: number[]): string {
  if (!bands || bands.length === 0) return ''
  return bands.map((b) => {
    const h = Math.max(1, Math.min(20, (b + 12) / 24 * 18))
    return '<div class="eq-bar" style="height:' + h + 'px"></div>'
  }).join('')
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
  if (!api) return
  const cleanup1 = api.on('audio-pip:update', (...args: unknown[]) => {
    const d = args[0] as PipUpdate | undefined
    if (!d) return
    if (d.mode) {
      mode.value = d.mode === 'max' ? 'x' : d.mode === 'medium' ? 'd' : 'm'
    }
    if (d.state) {
      const s = d.state
      trackName.value = s.trackName || '—'
      artist.value = s.artist || ''
      coverData.value = s.coverData || null
      isPlaying.value = !!s.isPlaying
      currentTime.value = typeof s.currentTime === 'number' ? s.currentTime : 0
      duration.value = typeof s.duration === 'number' ? s.duration : 0
      volume.value = typeof s.volume === 'number' ? s.volume : 1
      isMuted.value = !!s.isMuted
      if (s.equalizerBands) equalizerBands.value = s.equalizerBands
      nextTrackName.value = s.nextTrackName || ''
      nextTrackArtist.value = s.nextTrackArtist || ''
    }
    if (typeof d.opacity === 'number') bgAlpha.value = d.opacity
    if (d.cssVars) applyCssVars(d.cssVars)
  })
  const cleanup2 = api.on('audio-pip:theme', (...args: unknown[]) => {
    applyCssVars(args[0] as Record<string, string>)
  })
  cleanup = () => { cleanup1(); cleanup2() }
})

onUnmounted(() => {
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
          <img v-if="coverData" :src="coverData" class="w-19 h-19 rounded-lg object-cover block" alt="" />
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
            <button class="btn-pip" @click="send('shuffle')">&#x21C4;</button>
            <button class="btn-pip" @click="send('prev')">&#x23EE;</button>
            <button class="btn-pip btn-play" @click="send('playPause')">{{ isPlaying ? '\u23F8' : '\u25B6' }}</button>
            <button class="btn-pip" @click="send('next')">&#x23ED;</button>
            <button class="btn-pip" @click="send('repeat')">&#x21BB;</button>
          </div>
        </div>
      </div>
      <div class="absolute top-1 right-1 z-10">
        <button class="btn-pip w-4.5 h-4.5 text-[10px] text-fg-faint" @click="send('cycleMode')">&#x229E;</button>
      </div>
    </template>

    <!-- Max -->
    <template v-else>
      <!-- brak wizulizacji w tle oraz przydało by sie dodać guzik zmiejszenia aby było coś w sylu mim ale bez okładki cienki pasek ale z wszystkimi fukcjiami -->
      <div class="flex justify-between min-h-0 items-stretch">
        <!-- po lewej stronie  -->
        <div class="flex">
          <div class="shrink-0 pt-1 pb-0.5 pl-2">
            <img v-if="coverData" :src="coverData" class="w-22 h-22 rounded-lg object-cover block" alt="" />
            <div v-else class="w-22 h-22 rounded-lg bg-bg-hover"></div>
          </div>
          <div class="flex flex-1 min-w-0 flex-col justify-center pl-2.5 gap-0.5">
            <div class="text-[13px] font-semibold truncate text-fg-base">{{ trackName }}</div>
            <div class="text-[11px] text-fg-faint truncate">{{ artist }}</div>
            <div v-if="nextTrackName" class="flex pl-3 text-[10px] text-fg-faint truncate min-w-0">
              <span class="max-w-30 truncate shrink">&#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' \u2014 ' + nextTrackArtist : '' }}</span>
            </div>
          </div>
        </div>
        <!-- to ma być w cetrum okna ale ze lewa kolumna go przesuwa   -->
        <div class="flex flex-col items-center justify-center gap-1 shrink-0 pr-2.5 pt-1.5">
          <div class="flex items-center gap-1.5 shrink-0 px-2.5 pl-2">
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(currentTime) }}</span>
            <span class="text-[10px] text-fg-faint opacity-40">/</span>
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{ fmt(duration) }}</span>
          </div>
          <div>
            <button class="btn-pip w-5.5 h-5.5" @click="send('shuffle')">&#x21C4;</button>
            <button class="btn-pip w-5.5 h-5.5" @click="send('prev')">&#x23EE;</button>
            <button class="btn-pip btn-play w-5.5 h-5.5" @click="send('playPause')">{{ isPlaying ? '\u23F8' : '\u25B6' }}</button>
            <button class="btn-pip w-5.5 h-5.5" @click="send('next')">&#x23ED;</button>
            <button class="btn-pip w-5.5 h-5.5" @click="send('repeat')">&#x21BB;</button>
          </div>
        </div>
        <!-- po prawej stronie -->
        <div class="flex flex-col items-center justify-center gap-1 shrink-0 pr-2.5 pt-3">
          <div class="flex items-center  gap-1.5 shrink-0">
            <span class="text-[9px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover" @click="send('mute')">{{ volLabel }}</span>
            <input type="range" class="w-13.5 h-0.75" min="0" max="1" step="0.05" :value="volume" @input="onVolumeInput" />
            <span class="text-[10px] text-fg-faint min-w-6 text-right">{{ volPct }}</span>
          </div>
          <!-- całe do poprawy to nie działa nie mozna dodać nowego komponetu aby był pasek do sterowanie i wybrania wgranych ustawień   -->
          <div class="flex items-end gap-0.5 h-4.5 shrink-0" v-html="eqHtml(equalizerBands)"></div>
        </div>
      </div>
      <div class="absolute top-1 right-1 z-10">
        <button class="btn-pip w-4.5 h-4.5 text-[10px] text-fg-faint" @click="send('cycleMode')">&#x229E;</button>
      </div>
    </template>
  </div>

  <div class="fixed bottom-0 left-0 right-0 h-0.75 bg-bg-hover cursor-pointer z-20 hover:h-1.5 hover:bg-bg-active transition-all duration-150" @click="onProgressClick">
    <div class="h-full bg-accent-base w-0 rounded-r transition-[width]" :style="{ width: progressPct + '%' }"></div>
  </div>
</template>

