<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import JASSUB from 'jassub'
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url'
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url'
import workerUrl from 'jassub/dist/worker/worker.js?url'
import type { MkvFont } from '@renderer/types/subtitles'

interface PipSubtitleData {
  subContent: string
  fonts: MkvFont[]
  availableFonts: Record<string, string>
}

const api = window.api
const videoRef = ref<HTMLVideoElement | null>(null)
const progressRef = ref<HTMLDivElement | null>(null)
const currentTime = ref('0:00')
const duration = ref('0:00')
const progress = ref(0)
const showOverlay = ref(false)
let pendingStart = 0
let waitingForPlay = false
let jassub: any = null
let cleanups: (() => void)[] = []

function fmt(t: number): string {
  if (!t || !isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return m + ':' + (s < 10 ? '0' : '') + s
}

function applyCssVars(vars: Record<string, string> | undefined) {
  if (!vars) return
  const root = document.documentElement
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val)
  }
}

async function loadSubtitle(data: PipSubtitleData) {
  try {
    if (jassub) { jassub.destroy(); jassub = null }
    const v = videoRef.value
    if (!v) return
    const fonts = data.fonts.map((f) => new Uint8Array(f.data))
    const [wasmData, modernWasmData] = await Promise.all([
      fetch(wasmUrl).then((r) => r.arrayBuffer()),
      fetch(modernWasmUrl).then((r) => r.arrayBuffer())
    ])
    const wasmDataUrl = 'data:application/wasm;base64,' + uint8ToBase64(new Uint8Array(wasmData))
    const modernWasmDataUrl = 'data:application/wasm;base64,' + uint8ToBase64(new Uint8Array(modernWasmData))
    const availableFonts: Record<string, string> = {}
    for (const [k, val] of Object.entries(data.availableFonts)) {
      try { availableFonts[k] = new URL(val, document.baseURI).href } catch { availableFonts[k] = val }
    }
    jassub = new JASSUB({
      video: v,
      subContent: data.subContent,
      workerUrl,
      wasmUrl: wasmDataUrl,
      modernWasmUrl: modernWasmDataUrl,
      queryFonts: 'localandremote',
      fonts,
      availableFonts,
      defaultFont: 'arial'
    })
    await jassub.ready
  } catch {}
}

function clearSubtitle() {
  if (jassub) { jassub.destroy(); jassub = null }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = new Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i])
  return btoa(chars.join(''))
}

function onVideoMeta() {
  const v = videoRef.value
  if (!v) return
  duration.value = fmt(v.duration)
  if (pendingStart > 0) v.currentTime = pendingStart
  if (!waitingForPlay) v.play().catch(() => {})
}

function onTimeUpdate() {
  const v = videoRef.value
  if (!v) return
  progress.value = v.duration ? (v.currentTime / v.duration) * 100 : 0
  currentTime.value = fmt(v.currentTime)
}

function onVideoEnded() {
  api?.send('pip:ended')
}

function onProgressClick(e: MouseEvent) {
  const v = videoRef.value
  const bar = progressRef.value
  if (!v || !bar) return
  const r = bar.getBoundingClientRect()
  v.currentTime = ((e.clientX - r.left) / r.width) * v.duration
}

onMounted(() => {
  const v = videoRef.value
  if (v) v.crossOrigin = 'anonymous'

  if (!api) return

  const c1 = api.on('pip:videoSrc', (...args: unknown[]) => {
    const { src, start } = args[0] as { src: string; start: number }
    pendingStart = start || 0
    waitingForPlay = true
    if (videoRef.value) videoRef.value.src = src
  })
  cleanups.push(c1)

  const c2 = api.on('pip:play', (...args: unknown[]) => {
    const startTime = args[0] as number
    waitingForPlay = false
    const v = videoRef.value
    if (!v) return
    if (startTime > 0) v.currentTime = startTime
    v.play().catch(() => {})
  })
  cleanups.push(c2)

  const c3 = api.on('pip:requestTime', () => {
    api.send('pip:timeUpdate', videoRef.value?.currentTime || 0)
  })
  cleanups.push(c3)

  const c4 = api.on('pip:pause', () => {
    videoRef.value?.pause()
  })
  cleanups.push(c4)

  const c5 = api.on('pip:clear', () => {
    clearSubtitle()
    waitingForPlay = false
    const v = videoRef.value
    if (!v) return
    v.pause()
    v.removeAttribute('src')
    v.load()
  })
  cleanups.push(c5)

  const c6 = api.on('pip:subtitle', (...args: unknown[]) => {
    const data = args[0] as PipSubtitleData | null
    if (data && data.subContent) loadSubtitle(data)
    else clearSubtitle()
  })
  cleanups.push(c6)

  const c7 = api.on('pip:clearSubtitle', () => clearSubtitle())
  cleanups.push(c7)

  const c8 = api.on('pip:theme', (...args: unknown[]) => {
    applyCssVars(args[0] as Record<string, string>)
  })
  cleanups.push(c8)
})

onUnmounted(() => {
  clearSubtitle()
  cleanups.forEach((fn) => fn())
  cleanups = []
})
</script>

<template>
  <div
    class="relative w-full h-full flex flex-col bg-black select-none"
    @mouseenter="showOverlay = true"
    @mouseleave="showOverlay = false"
  >
    <video
      ref="videoRef"
      class="flex-1 w-full object-contain bg-black"
      preload="auto"
      @loadedmetadata="onVideoMeta"
      @timeupdate="onTimeUpdate"
      @ended="onVideoEnded"
    />

    <button
      class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center z-10 border-none cursor-pointer transition-all duration-150"
      :style="{
        background: showOverlay ? 'rgba(229,62,62,0.9)' : 'rgba(0,0,0,0.6)',
        color: showOverlay ? '#fff' : 'var(--color-fg-faint, #aaa)',
        opacity: showOverlay ? 1 : 0
      }"
      @click="api?.send('pip:hidden')"
    >&#x2715;</button>

    <div class="absolute bottom-2 left-2 text-[10px] font-mono pointer-events-none" :style="{ color: 'var(--color-fg-faint, rgba(255,255,255,0.5))' }">{{ currentTime }}</div>

    <div class="absolute bottom-2 right-2 text-[10px] font-mono pointer-events-none" :style="{ color: 'var(--color-fg-faint, rgba(255,255,255,0.5))' }">{{ duration }}</div>

    <div
      ref="progressRef"
      class="h-1 shrink-0 cursor-pointer"
      :style="{ background: 'var(--color-bg-hover, rgba(255,255,255,0.15))' }"
      @click="onProgressClick"
    >
      <div
        class="h-full rounded-r"
        :style="{ width: progress + '%', background: 'var(--color-accent-base, #7c6aef)' }"
      ></div>
    </div>
  </div>
</template>
