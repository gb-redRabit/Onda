import { ElectronAPI } from '@electron-toolkit/preload'

interface OndaAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  once: (channel: string, callback: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: string) => void
  pipStart: (
    videoSrc: string,
    settings?: {
      position?: string
      width?: number
      height?: number
      startTime?: number
      subtitle?: unknown
    }
  ) => Promise<boolean>
  pipStop: () => Promise<boolean>
  pipPreviewStart: (opts: {
    position?: string
    width?: number
    height?: number
  }) => Promise<boolean>
  pipPreviewStop: () => Promise<boolean>
  pipPreviewUpdate: (opts: {
    position?: string
    width?: number
    height?: number
  }) => Promise<boolean>
  pipPreload: (
    videoSrc: string,
    subtitleData: {
      subContent: string
      fonts: Array<{ name: string; data: number[] }>
      availableFonts: Record<string, string>
    } | null
  ) => Promise<void>
  pipLoadTrack: (
    videoSrc: string,
    subtitleData: {
      subContent: string
      fonts: Array<{ name: string; data: number[] }>
      availableFonts: Record<string, string>
    } | null
  ) => Promise<void>
  checkFfmpeg: () => Promise<{ installed: boolean; version: string | null }>
  checkFfprobe: () => Promise<{ installed: boolean; version: string | null }>
  checkYtdlp: () => Promise<{ installed: boolean; version: string | null; path: string | null }>
  installFfmpeg: () => Promise<{ success: boolean; error?: string }>
  installYtdlp: () => Promise<{ success: boolean; error?: string }>
  checkMkvextract: () => Promise<{ installed: boolean; version: string | null }>
  installMkvextract: () => Promise<{ success: boolean; error?: string }>
  getCover: (filePath: string) => Promise<{ type: 'video' | 'image' | null; data: string | null }>
  getDuration: (filePath: string) => Promise<number>
  getFilePath: (file: File) => string
  listEmbeddedSubtitles: (
    filePath: string
  ) => Promise<Array<{ index: number; language: string; title: string; codec: string }>>
  extractEmbeddedSubtitle: (
    filePath: string,
    streamIndex: number
  ) => Promise<{ content: string; format: string } | null>
  findExternalSubtitles: (
    videoPath: string
  ) => Promise<Array<{ name: string; path: string; format: string }>>
  readSubtitleFile: (filePath: string) => Promise<string | null>
  extractSubtitleFonts: (
    filePath: string
  ) => Promise<Array<{ name: string; ext: string; data: number[] }>>
  pipUpdateSubtitle: (
    data: {
      subContent: string
      fonts: Array<{ name: string; data: number[] }>
      availableFonts: Record<string, string>
    } | null
  ) => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: OndaAPI
  }
}
