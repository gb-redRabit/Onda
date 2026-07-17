import { ref, onUnmounted } from 'vue'
import type { MkvFont } from '@renderer/types/subtitles'
import { getLastSubtitleData } from '@renderer/composables/useSubtitleRenderer'

export interface PiPSubtitleData {
  subContent: string
  fonts: MkvFont[]
  availableFonts: Record<string, string>
}

export function usePiP(callbacks?: {
  onClosed?: (time: number) => void
  onEnded?: () => void
}) {
  const isActive = ref(false)
  const currentTime = ref(0)

  const cleanups: (() => void)[] = []

  function init(): void {
    console.log('[PiP][usePiP] init -> listening for pip:closed, pip:ended')
    cleanups.push(
      window.api.on('pip:closed', (time: unknown) => {
        const savedTime = (time as number) || 0
        console.log('[PiP][usePiP] pip:closed received -> time:', savedTime)
        currentTime.value = savedTime
        isActive.value = false
        callbacks?.onClosed?.(savedTime)
      })
    )
    cleanups.push(
      window.api.on('pip:ended', () => {
        console.log('[PiP][usePiP] pip:ended received')
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
    console.log('[PiP][usePiP] start -> calling pipStart, startTime:', settings.startTime)
    return window.api.pipStart(videoSrc, settings as any)
  }

  function stop(): Promise<boolean> {
    console.log('[PiP][usePiP] stop')
    return window.api.pipStop()
  }

  function loadTrack(
    videoSrc: string,
    subtitleData: PiPSubtitleData | null
  ): void {
    console.log('[PiP][usePiP] loadTrack -> src:', videoSrc.substring(0, 80))
    window.api.pipLoadTrack(videoSrc, subtitleData as any)
  }

  function preload(
    videoSrc: string,
    subtitleData: PiPSubtitleData | null
  ): void {
    console.log('[PiP][usePiP] preload -> src:', videoSrc.substring(0, 80))
    window.api.pipPreload(videoSrc, subtitleData as any)
  }

  function loadTrackFromCurrent(): void {
    const videoEl = document.querySelector('video') as HTMLVideoElement | null
    if (!videoEl) return
    const src = videoEl.src || ''
    if (!src) return
    const subtitleData = getLastSubtitleData()
    console.log('[PiP][usePiP] loadTrackFromCurrent -> src:', src.substring(0, 80))
    window.api.pipLoadTrack(src, subtitleData as any)
  }

  function updateSubtitle(subtitleData: PiPSubtitleData | null): void {
    console.log('[PiP][usePiP] updateSubtitle -> has:', !!(subtitleData?.subContent))
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
