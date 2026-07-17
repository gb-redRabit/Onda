import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  send: (channel: string, ...args: unknown[]): void => {
    ipcRenderer.send(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  once: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  },
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  },
  pipStart: (
    videoSrc: string,
    settings?: { position?: string; width?: number; height?: number; startTime?: number }
  ): Promise<boolean> => ipcRenderer.invoke('pip:start', videoSrc, settings),
  pipStop: (): Promise<boolean> => ipcRenderer.invoke('pip:stop'),
  pipUpdateSrc: (videoSrc: string): Promise<void> => ipcRenderer.invoke('pip:updatesrc', videoSrc),
  checkFfmpeg: (): Promise<{ installed: boolean; version: string | null }> =>
    ipcRenderer.invoke('dep:checkFfmpeg'),
  checkFfprobe: (): Promise<{ installed: boolean; version: string | null }> =>
    ipcRenderer.invoke('dep:checkFfprobe'),
  checkYtdlp: (): Promise<{ installed: boolean; version: string | null; path: string | null }> =>
    ipcRenderer.invoke('dep:checkYtdlp'),
  installFfmpeg: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dep:installFfmpeg'),
  installYtdlp: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dep:installYtdlp'),
  checkMkvextract: (): Promise<{ installed: boolean; version: string | null }> =>
    ipcRenderer.invoke('dep:checkMkvextract'),
  installMkvextract: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dep:installMkvextract'),
  getCover: (filePath: string): Promise<{ type: 'video' | 'image' | null; data: string | null }> =>
    ipcRenderer.invoke('media:getCover', filePath),
  getDuration: (filePath: string): Promise<number> =>
    ipcRenderer.invoke('media:getDuration', filePath),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  listEmbeddedSubtitles: (
    filePath: string
  ): Promise<Array<{ index: number; language: string; title: string; codec: string }>> =>
    ipcRenderer.invoke('subtitles:listEmbedded', filePath),
  extractEmbeddedSubtitle: (
    filePath: string,
    streamIndex: number
  ): Promise<{ content: string; format: string } | null> =>
    ipcRenderer.invoke('subtitles:extractEmbedded', filePath, streamIndex),
  findExternalSubtitles: (
    videoPath: string
  ): Promise<Array<{ name: string; path: string; format: string }>> =>
    ipcRenderer.invoke('subtitles:findExternal', videoPath),
  readSubtitleFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('subtitles:readFile', filePath),
  extractSubtitleFonts: (
    filePath: string
  ): Promise<Array<{ name: string; ext: string; data: number[] }>> =>
    ipcRenderer.invoke('subtitles:extractAttachments', filePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
