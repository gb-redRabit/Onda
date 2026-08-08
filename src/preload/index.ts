import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { MusicbrainzRelease, AppInfo, UpdaterState } from '../shared/types/ipc';
import { logger } from '../shared/logger';

// Fetched over IPC (not CLI args) so the media-server token never shows up in
// the process command line. The main handler is registered before any window
// is created, so sendSync resolves immediately.
let mediaServerUrl = '';
try {
  mediaServerUrl = ipcRenderer.sendSync('media:getServerUrl') as string;
} catch {
  mediaServerUrl = '';
}

const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  'fs:readdir',
  'fs:getDrives',
  'fs:findDuplicates',
  'fs:delete',
  'fs:copy',
  'fs:move',
  'fs:mkdir',
  'fs:copyPath',
  'fs:getProperties',
  'app:getPath',
  'app:quit',
  'window:close',
  'window:minimize',
  'window:maximize',
  'window:exitFullscreen',
  'window:isFullscreen',
  'window:toggleFullscreen',
  'window:setAlwaysOnTop',
  'dialog:openFile',
  'dialog:openSubtitle',
  'dialog:openFolder',
  'dialog:openFolderFiles',
  'shell:showItemInFolder',
  'shell:openTerminal',
  'shell:openWithDefault',
  'shell:getFileIcon',
  'media:getThumbnail',
  'media:renameFile',
  'explorer:create',
  'explorer:tabMoved',
  'explorer:sendTabToMain',
  'settings:get',
  'settings:set',
  'settings:export',
  'settings:import',
  'library:scan',
  'library:loadFolders',
  'library:loadScanned',
  'library:saveFolders',
  'library:saveScanned',
  'library:updateStats',
  'playlist:loadAll',
  'playlist:saveAll',
  'playback:setPosition',
  'playback:clearPosition',
  'yt:search',
  'pip:start',
  'pip:stop',
  'pip:preload',
  'pip:loadtrack',
  'pip:updateSubtitle',
  'pip:previewStart',
  'pip:previewStop',
  'pip:previewUpdate',
  'audio-pip:show',
  'audio-pip:hide',
  'audio-pip:update'
]);

const ALLOWED_SEND_CHANNELS = new Set<string>([
  'explorer:refreshAll',
  'audio-pip:vizData',
  'audio-pip:timeUpdate',
  'audio-pip:theme',
  'audio-pip:showMain',
  'audio-pip:action',
  'audio-pip:progressClick',
  'pip:theme',
  'pip:locale',
  'pip:ended',
  'pip:maximize',
  'pip:timeUpdate',
  'pip:hidden'
]);

const ALLOWED_RECEIVE_CHANNELS = new Set<string>([
  'window:maximized',
  'window:fullscreenChanged',
  'dep:progress',
  'updater:event',
  'audio-pip:closed',
  'audio-pip:action',
  'audio-pip:progressClick',
  'audio-pip:update',
  'audio-pip:vizData',
  'audio-pip:theme',
  'pip:closed',
  'pip:ended',
  'pip:maximize',
  'pip:videoSrc',
  'pip:play',
  'pip:requestTime',
  'pip:pause',
  'pip:clear',
  'pip:subtitle',
  'pip:clearSubtitle',
  'pip:theme',
  'pip:locale',
  'fs:readdir:batch',
  'library:scan:progress',
  'media:playPause',
  'media:next',
  'media:previous',
  'media:stop',
  'media:volumeUp',
  'media:volumeDown',
  'media:toggleMute',
  'explorer:add-tab',
  'explorer:refresh',
  'explorer:remove-tab'
]);

function trySend(channel: string, ...args: unknown[]): void {
  if (!ALLOWED_SEND_CHANNELS.has(channel)) {
    logger.warn('preload', `IPC send on non-allowlisted channel '${channel}' blocked`);
    return;
  }
  try {
    ipcRenderer.send(channel, ...args);
  } catch (e) {
    logger.error('preload', `IPC send failed on '${channel}'`, e);
  }
}

function tryInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    logger.warn('preload', `IPC invoke on non-allowlisted channel '${channel}' blocked`);
    return Promise.resolve(undefined);
  }
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
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      logger.warn('preload', `IPC on for non-allowlisted channel '${channel}' blocked`);
      return () => {};
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  once: (channel: string, callback: (...args: unknown[]) => void): void => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      logger.warn('preload', `IPC once for non-allowlisted channel '${channel}' blocked`);
      return;
    }
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
  removeAllListeners: (channel: string): void => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      logger.warn('preload', `IPC removeAllListeners on non-allowlisted channel '${channel}' blocked`);
      return;
    }
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
  pipPreviewStart: async (opts: {
    position?: string;
    width?: number;
    height?: number;
  }): Promise<boolean> => {
    const r = await tryInvoke('pip:previewStart', opts);
    return !!r;
  },
  pipPreviewStop: async (): Promise<boolean> => {
    const r = await tryInvoke('pip:previewStop');
    return !!r;
  },
  pipPreviewUpdate: async (opts: {
    position?: string;
    width?: number;
    height?: number;
  }): Promise<boolean> => {
    const r = await tryInvoke('pip:previewUpdate', opts);
    return !!r;
  },
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
  openSubtitleDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:openSubtitle'),
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
