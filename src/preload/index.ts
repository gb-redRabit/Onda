import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const mediaServerUrl: string = ipcRenderer.sendSync('media:getServerUrlSync');

const api = {
  mediaServerUrl,
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args);
  },
  send: (channel: string, ...args: unknown[]): void => {
    ipcRenderer.send(channel, ...args);
  },
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  once: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
  },
  pipStart: (
    videoSrc: string,
    settings?: {
      position?: string;
      width?: number;
      height?: number;
      startTime?: number;
      subtitle?: {
        subContent: string;
        fonts: Array<{ name: string; data: number[] }>;
        availableFonts: Record<string, string>;
      } | null;
    }
  ): Promise<boolean> => ipcRenderer.invoke('pip:start', videoSrc, settings),
  pipStop: (): Promise<boolean> => ipcRenderer.invoke('pip:stop'),
  pipPreviewStart: (opts: {
    position?: string;
    width?: number;
    height?: number;
  }): Promise<boolean> => ipcRenderer.invoke('pip:previewStart', opts),
  pipPreviewStop: (): Promise<boolean> => ipcRenderer.invoke('pip:previewStop'),
  pipPreviewUpdate: (opts: {
    position?: string;
    width?: number;
    height?: number;
  }): Promise<boolean> => ipcRenderer.invoke('pip:previewUpdate', opts),
  pipPreload: (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ): Promise<void> => ipcRenderer.invoke('pip:preload', videoSrc, subtitleData),
  pipLoadTrack: (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ): Promise<void> => ipcRenderer.invoke('pip:loadtrack', videoSrc, subtitleData),
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
  writeTags: (
    filePath: string,
    tags: Record<string, string | undefined>
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('media:writeTags', filePath, tags),
  renameFile: (
    oldPath: string,
    newName: string
  ): Promise<{ success: boolean; error?: string; newPath?: string }> =>
    ipcRenderer.invoke('media:renameFile', oldPath, newName),
  writeCover: (
    filePath: string,
    imageSource: number[] | string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('media:writeCover', filePath, imageSource),
  readCover: (filePath: string): Promise<{ mime?: string; data?: number[] } | null> =>
    ipcRenderer.invoke('media:readCover', filePath),
  openImageDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:openImage'),
  musicbrainzSearchRelease: (
    query: string
  ): Promise<{ success: boolean; releases: any[]; error?: string }> =>
    ipcRenderer.invoke('musicbrainz:searchRelease', query),
  musicbrainzLookupRelease: (
    releaseId: string
  ): Promise<{ success: boolean; release?: any; error?: string }> =>
    ipcRenderer.invoke('musicbrainz:lookupRelease', releaseId),
  musicbrainzGetCoverData: (
    releaseId: string
  ): Promise<{ success: boolean; data?: number[]; mime?: string; error?: string }> =>
    ipcRenderer.invoke('musicbrainz:getCoverData', releaseId),
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
    ipcRenderer.invoke('subtitles:extractAttachments', filePath),
  getPlaybackPosition: (filePath: string): Promise<number> =>
    ipcRenderer.invoke('playback:getPosition', filePath),
  setPlaybackPosition: (filePath: string, position: number): Promise<void> =>
    ipcRenderer.invoke('playback:setPosition', filePath, position),
  clearPlaybackPosition: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('playback:clearPosition', filePath),
  pipUpdateSubtitle: (
    data: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ): Promise<void> => ipcRenderer.invoke('pip:updateSubtitle', data),
  checkAudioCodec: (filePath: string): Promise<{ codec: string; supported: boolean } | null> =>
    ipcRenderer.invoke('media:checkAudioCodec', filePath),
  transcodeAudio: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('media:transcodeAudio', filePath),
  transcodeAudioChunk: (filePath: string, startTime: number, duration: number): Promise<string | null> =>
    ipcRenderer.invoke('media:transcodeAudioChunk', filePath, startTime, duration),
  cleanupTranscodedAudio: (audioPath: string): Promise<void> =>
    ipcRenderer.invoke('media:cleanupTranscodedAudio', audioPath),
  audioPipShow: (
    state: {
      trackName: string;
      artist: string;
      coverData: string | null;
      isPlaying: boolean;
      currentTime: number;
      duration: number;
      volume: number;
    },
    mode?: string,
    opacity?: number
  ): Promise<boolean> => ipcRenderer.invoke('audio-pip:show', state, mode, opacity),
  audioPipHide: (): Promise<boolean> => ipcRenderer.invoke('audio-pip:hide'),
  audioPipUpdate: (
    state: {
      trackName: string;
      artist: string;
      coverData: string | null;
      isPlaying: boolean;
      currentTime: number;
      duration: number;
      volume: number;
    },
    mode?: string,
    opacity?: number
  ): Promise<boolean> => ipcRenderer.invoke('audio-pip:update', state, mode, opacity)
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
