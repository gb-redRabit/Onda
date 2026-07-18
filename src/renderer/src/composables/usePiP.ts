import { ref, onUnmounted } from 'vue'
import type { MkvFont } from '@renderer/types/subtitles'
import { getLastSubtitleData } from '@renderer/composables/useSubtitleRenderer'

export interface PiPSubtitleData {
  subContent: string
  fonts: MkvFont[]
  availableFonts: Record<string, string>
}

export function usePiP(callbacks?: { onClosed?: (time: number) => void; onEnded?: () => void }) {
  const isActive = ref(false)
  const currentTime = ref(0)

  const cleanups: (() => void)[] = []

  function init(): void {
    cleanups.push(
      window.api.on('pip:closed', (time: unknown) => {
        const savedTime = (time as number) || 0
        currentTime.value = savedTime
        isActive.value = false
        callbacks?.onClosed?.(savedTime)
      })
    )
    cleanups.push(
      window.api.on('pip:ended', () => {
        callbacks?.onEnded?.()
      })
    )
  }

  function start(
    videoSrc: string,
    options?: {
      position?: string
      width?: number
      height?: number
      startTime?: number
      subtitle?: boolean
    }
  ): Promise<boolean> {
    const settings = {
      position: options?.position,
      width: options?.width,
      height: options?.height,
      startTime: options?.startTime || 0,
      subtitle: options?.subtitle !== false ? getLastSubtitleData() : null
    }
    return window.api.pipStart(videoSrc, settings as any)
  }

  function stop(): Promise<boolean> {
    return window.api.pipStop()
  }

  function loadTrack(videoSrc: string, subtitleData: PiPSubtitleData | null): void {
    window.api.pipLoadTrack(videoSrc, subtitleData as any)
  }

  function preload(videoSrc: string, subtitleData: PiPSubtitleData | null): void {
    window.api.pipPreload(videoSrc, subtitleData as any)
  }

  function loadTrackFromCurrent(): void {
    const videoEl = document.querySelector('video') as HTMLVideoElement | null
    if (!videoEl) return
    const src = videoEl.src || ''
    if (!src) return
    const subtitleData = getLastSubtitleData()
    window.api.pipLoadTrack(src, subtitleData as any)
  }

  function updateSubtitle(subtitleData: PiPSubtitleData | null): void {
    window.api.pipUpdateSubtitle(subtitleData as any)
  }

  init()

  onUnmounted(() => {
    cleanups.forEach((fn) => fn())
  })

  return {
    isActive,
    currentTime,
    start,
    stop,
    preload,
    loadTrack,
    loadTrackFromCurrent,
    updateSubtitle
  }
}
