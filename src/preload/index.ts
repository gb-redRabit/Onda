import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { MusicbrainzRelease, AppInfo, UpdaterState } from '../shared/types/ipc';
import { logger } from '../shared/logger';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const mediaServerUrl: string = getArg('onda-media-url') ?? '';

function trySend(channel: string, ...args: unknown[]): void {
  try {
    ipcRenderer.send(channel, ...args);
  } catch (e) {
    logger.error('preload', `IPC send failed on '${channel}'`, e);
  }
}

function tryInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  try {
    const p = ipcRenderer.invoke(channel, ...args);
    return p.catch((e) => {
      logger.error('preload', `IPC invoke rejected on '${channel}'`, e);
      return undefined;
    });
  } catch (e) {
    logger.error('preload', `IPC invoke failed on '${channel}'`, e);
    return Promise.resolve(undefined);
  }
}

const api = {
  mediaServerUrl,
  invoke: tryInvoke,
  getWindowId: (): Promise<number> => ipcRenderer.invoke('window:id'),
  send: trySend,
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
  pipStart: async (
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
  ): Promise<boolean> => {
    const r = await tryInvoke('pip:start', videoSrc, settings);
    return !!r;
  },
  pipStop: async (): Promise<boolean> => {
    const r = await tryInvoke('pip:stop');
    return !!r;
  },
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
  pipPreload: async (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ): Promise<void> => {
    await tryInvoke('pip:preload', videoSrc, subtitleData);
  },
  pipLoadTrack: async (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ): Promise<void> => {
    await tryInvoke('pip:loadtrack', videoSrc, subtitleData);
  },
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
  getDependencyPaths: (): Promise<
    Array<{ tool: string; path: string | null; managed: boolean; version: string | null }>
  > => ipcRenderer.invoke('dep:getPaths'),
  checkUpdateYtdlp: (): Promise<{
    updateAvailable: boolean;
    current: string | null;
    latest: string | null;
  }> => ipcRenderer.invoke('dep:checkUpdateYtdlp'),
  updateYtdlp: (): Promise<{ success: boolean; error?: string; cancelled?: boolean }> =>
    ipcRenderer.invoke('dep:updateYtdlp'),
  removeYtdlp: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dep:removeYtdlp'),
  removeFfmpeg: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dep:removeFfmpeg'),
  removeMkvextract: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('dep:removeMkvextract'),
  cancelDepInstall: (tool: string): Promise<boolean> =>
    ipcRenderer.invoke('dep:cancelInstall', tool),
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
  ): Promise<{ success: boolean; releases: MusicbrainzRelease[]; error?: string }> =>
    ipcRenderer.invoke('musicbrainz:searchRelease', query),
  musicbrainzLookupRelease: (
    releaseId: string
  ): Promise<{ success: boolean; release?: MusicbrainzRelease; error?: string }> =>
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
  pipUpdateSubtitle: async (
    data: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ): Promise<void> => {
    await tryInvoke('pip:updateSubtitle', data);
  },
  checkAudioCodec: (filePath: string): Promise<{ codec: string; supported: boolean } | null> =>
    ipcRenderer.invoke('media:checkAudioCodec', filePath),
  setAllowedRoots: async (roots: string[]): Promise<void> => {
    await tryInvoke('media:setAllowedRoots', roots);
  },
  transcodeAudio: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('media:transcodeAudio', filePath),
  transcodeAudioChunk: (
    filePath: string,
    startTime: number,
    duration: number
  ): Promise<string | null> =>
    ipcRenderer.invoke('media:transcodeAudioChunk', filePath, startTime, duration),
  audioPipShow: async (
    state: Record<string, unknown>,
    mode?: string,
    opacity?: number,
    position?: string
  ): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:show', state, mode, opacity, position);
    return !!r;
  },
  audioPipHide: async (): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:hide');
    return !!r;
  },
  audioPipUpdate: async (
    state: Record<string, unknown>,
    mode?: string,
    opacity?: number,
    position?: string
  ): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:update', state, mode, opacity, position);
    return !!r;
  },
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
  getLicenses: (): Promise<Array<{ name: string; version?: string; license?: string }>> =>
    ipcRenderer.invoke('app:getLicenses'),
  readLogs: (lines?: number): Promise<string> => ipcRenderer.invoke('diagnostics:readLogs', lines),
  clearLogs: (): Promise<boolean> => ipcRenderer.invoke('diagnostics:clearLogs'),
  downloadLog: (): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('diagnostics:downloadLog'),
  getUpdaterState: (): Promise<UpdaterState> => ipcRenderer.invoke('updater:getState'),
  checkForUpdates: (): Promise<{ checking: boolean }> => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('updater:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install')
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    logger.error('preload', 'exposeInMainWorld failed', error);
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api;
}
