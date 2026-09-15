import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  MusicbrainzRelease,
  AppInfo,
  UpdaterState,
  YoutubeAuthStatus,
  IpcSubscription,
  IpcSubscriptionPatch,
  IpcSubscriptionDownloadPrefs,
  IpcSubscriptionCheckResult,
  IpcStreamResult,
  IpcSavedData,
  IpcSavedStream,
  IpcSavedPlaylist,
  IpcRadioStation,
  PluginInfo,
  PluginFetchOptions,
  PluginFetchResult,
  IpcPluginGetResult,
  IpcPluginUninstallResult,
  IpcPluginInstallResult
} from '../shared/types/ipc';
import type { IpcArgs, IpcChannel, IpcResult } from '../shared/ipc/contract';
import type { OndaAPI } from '../shared/ipc/api';
import {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_RECEIVE_CHANNELS,
  ALLOWED_SEND_CHANNELS
} from './generated';
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

// Every invoke goes through this guard — the generated allowlist is the single
// source of truth, so typed wrappers cannot silently bypass it.
function tryInvoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>;
function tryInvoke(channel: string, ...args: unknown[]): Promise<unknown>;
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

const api: OndaAPI = {
  mediaServerUrl,
  invoke: tryInvoke,
  getWindowId: (): Promise<number> => tryInvoke('window:id'),
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
      logger.warn(
        'preload',
        `IPC removeAllListeners on non-allowlisted channel '${channel}' blocked`
      );
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
  checkFfmpeg: () => tryInvoke('dep:checkFfmpeg'),
  checkFfprobe: () => tryInvoke('dep:checkFfprobe'),
  checkYtdlp: () => tryInvoke('dep:checkYtdlp'),
  installFfmpeg: (): Promise<{ success: boolean; error?: string }> =>
    tryInvoke('dep:installFfmpeg'),
  installYtdlp: (): Promise<{ success: boolean; error?: string }> => tryInvoke('dep:installYtdlp'),
  checkMkvextract: () => tryInvoke('dep:checkMkvextract'),
  installMkvextract: (): Promise<{ success: boolean; error?: string }> =>
    tryInvoke('dep:installMkvextract'),
  getDependencyPaths: (): Promise<
    Array<{ tool: string; path: string | null; managed: boolean; version: string | null }>
  > => tryInvoke('dep:getPaths'),
  checkUpdateYtdlp: (): Promise<{
    updateAvailable: boolean;
    current: string | null;
    latest: string | null;
  }> => tryInvoke('dep:checkUpdateYtdlp'),
  updateYtdlp: (): Promise<{ success: boolean; error?: string; cancelled?: boolean }> =>
    tryInvoke('dep:updateYtdlp'),
  removeYtdlp: (): Promise<{ success: boolean; error?: string }> => tryInvoke('dep:removeYtdlp'),
  removeFfmpeg: (): Promise<{ success: boolean; error?: string }> => tryInvoke('dep:removeFfmpeg'),
  removeFfprobe: (): Promise<{ success: boolean; error?: string }> =>
    tryInvoke('dep:removeFfprobe'),
  removeMkvextract: (): Promise<{ success: boolean; error?: string }> =>
    tryInvoke('dep:removeMkvextract'),
  cancelDepInstall: (tool: string): Promise<boolean> => tryInvoke('dep:cancelInstall', tool),
  getCover: (filePath: string): Promise<{ type: 'video' | 'image' | null; data: string | null }> =>
    tryInvoke('media:getCover', filePath),
  getDuration: (filePath: string): Promise<number> => tryInvoke('media:getDuration', filePath),
  getDurations: (paths: string[]): Promise<Record<string, number>> =>
    tryInvoke('media:batchDurations', paths),
  writeTags: (
    filePath: string,
    tags: Record<string, string | undefined>
  ): Promise<{ success: boolean; error?: string }> => tryInvoke('media:writeTags', filePath, tags),
  renameFile: (
    oldPath: string,
    newName: string
  ): Promise<{ success: boolean; error?: string; newPath?: string }> =>
    tryInvoke('media:renameFile', oldPath, newName),
  writeCover: (
    filePath: string,
    imageSource: number[] | string
  ): Promise<{ success: boolean; error?: string }> =>
    tryInvoke('media:writeCover', filePath, imageSource),
  readCover: (filePath: string): Promise<{ mime?: string; data?: number[] } | null> =>
    tryInvoke('media:readCover', filePath),
  openImageDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    tryInvoke('dialog:openImage'),
  openSubtitleDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    tryInvoke('dialog:openSubtitle'),
  musicbrainzSearchRelease: (
    query: string
  ): Promise<{ success: boolean; releases: MusicbrainzRelease[]; error?: string }> =>
    tryInvoke('musicbrainz:searchRelease', query),
  musicbrainzLookupRelease: (
    releaseId: string
  ): Promise<{ success: boolean; release?: MusicbrainzRelease; error?: string }> =>
    tryInvoke('musicbrainz:lookupRelease', releaseId),
  musicbrainzGetCoverData: (
    releaseId: string
  ): Promise<{
    success: boolean;
    data?: number[];
    mime?: string;
    error?: string;
    rateLimited?: boolean;
  }> => tryInvoke('musicbrainz:getCoverData', releaseId),
  musicbrainzAutodetect: (
    query: string
  ): Promise<{
    success: boolean;
    match: 'certain' | 'ambiguous' | 'none';
    releases: MusicbrainzRelease[];
    error?: string;
  }> => tryInvoke('musicbrainz:autodetect', query),
  musicbrainzBatchApply: (payload: unknown): Promise<{ success: boolean; error?: string }> =>
    tryInvoke('musicbrainz:batchApply', payload),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  listEmbeddedSubtitles: (
    filePath: string
  ): Promise<Array<{ index: number; language: string; title: string; codec: string }>> =>
    tryInvoke('subtitles:listEmbedded', filePath),
  extractEmbeddedSubtitle: (
    filePath: string,
    streamIndex: number
  ): Promise<{ content: string; format: string } | null> =>
    tryInvoke('subtitles:extractEmbedded', filePath, streamIndex),
  findExternalSubtitles: (
    videoPath: string
  ): Promise<Array<{ name: string; path: string; format: string }>> =>
    tryInvoke('subtitles:findExternal', videoPath),
  readSubtitleFile: (filePath: string): Promise<string | null> =>
    tryInvoke('subtitles:readFile', filePath),
  extractSubtitleFonts: (
    filePath: string
  ): Promise<Array<{ name: string; ext: string; data: number[] }>> =>
    tryInvoke('subtitles:extractAttachments', filePath),
  getPlaybackPosition: (filePath: string): Promise<number> =>
    tryInvoke('playback:getPosition', filePath),
  setPlaybackPosition: (filePath: string, position: number): Promise<void> =>
    tryInvoke('playback:setPosition', filePath, position),
  clearPlaybackPosition: (filePath: string): Promise<void> =>
    tryInvoke('playback:clearPosition', filePath),
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
    tryInvoke('media:checkAudioCodec', filePath),
  transcodeAudio: (filePath: string): Promise<string | null> =>
    tryInvoke('media:transcodeAudio', filePath),
  transcodeAudioChunk: (
    filePath: string,
    startTime: number,
    duration: number
  ): Promise<string | null> =>
    tryInvoke('media:transcodeAudioChunk', filePath, startTime, duration),
  transcodeVideo: (filePath: string): Promise<string | null> =>
    tryInvoke('media:transcodeVideo', filePath),
  audioPipShow: async (
    state: Record<string, unknown>,
    opts?: { dock?: string; cornerElements?: string[]; edgeElements?: string[]; autoHide?: boolean }
  ): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:show', state, opts);
    return !!r;
  },
  audioPipPrewarm: async (): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:prewarm');
    return !!r;
  },
  audioPipHide: async (): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:hide');
    return !!r;
  },
  audioPipAutoHide: async (): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:autoHide');
    return !!r;
  },
  audioPipUpdate: async (
    state: Record<string, unknown>,
    opts?: { dock?: string; cornerElements?: string[]; edgeElements?: string[]; autoHide?: boolean }
  ): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:update', state, opts);
    return !!r;
  },
  audioPipPreviewStart: async (opts?: {
    dock?: string;
    cornerElements?: string[];
    edgeElements?: string[];
    autoHide?: boolean;
  }): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:previewStart', opts);
    return !!r;
  },
  audioPipPreviewStop: async (): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:previewStop');
    return !!r;
  },
  audioPipPreviewUpdate: async (opts?: {
    dock?: string;
    cornerElements?: string[];
    edgeElements?: string[];
    autoHide?: boolean;
  }): Promise<boolean> => {
    const r = await tryInvoke('audio-pip:previewUpdate', opts);
    return !!r;
  },
  getAppInfo: (): Promise<AppInfo> => tryInvoke('app:getInfo'),
  getAutoLaunch: (): Promise<{ enabled: boolean; hidden: boolean }> =>
    tryInvoke('app:getAutoLaunch'),
  setAutoLaunch: (opts: { enabled: boolean; hidden?: boolean }): Promise<boolean> =>
    tryInvoke('app:setAutoLaunch', opts),
  cancelLibraryScan: (): Promise<boolean> => tryInvoke('library:scanCancel'),
  grantMediaAccess: (filePath: string): Promise<boolean> =>
    tryInvoke('media:grantAccess', filePath),
  getLicenses: (): Promise<Array<{ name: string; version?: string; license?: string }>> =>
    tryInvoke('app:getLicenses'),
  readLogs: (lines?: number): Promise<string> => tryInvoke('diagnostics:readLogs', lines),
  clearLogs: (): Promise<boolean> => tryInvoke('diagnostics:clearLogs'),
  downloadLog: (): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    tryInvoke('diagnostics:downloadLog'),
  getUpdaterState: (): Promise<UpdaterState> => tryInvoke('updater:getState'),
  checkForUpdates: (): Promise<{ checking: boolean }> => tryInvoke('updater:check'),
  downloadUpdate: (): Promise<boolean> => tryInvoke('updater:download'),
  installUpdate: (): Promise<void> => tryInvoke('updater:install'),
  youtubeAuthStatus: (): Promise<YoutubeAuthStatus> => tryInvoke('yt:authStatus'),
  getStreamUrl: (url: string): Promise<IpcStreamResult> => tryInvoke('yt:stream:get', url),
  savedLoad: (): Promise<IpcSavedData> => tryInvoke('saved:load'),
  savedSaveTrack: (track: IpcSavedStream): Promise<boolean> => tryInvoke('saved:saveTrack', track),
  savedRemoveTrack: (id: string): Promise<boolean> => tryInvoke('saved:removeTrack', id),
  savedSavePlaylist: (playlist: IpcSavedPlaylist): Promise<boolean> =>
    tryInvoke('saved:savePlaylist', playlist),
  savedRemovePlaylist: (id: string): Promise<boolean> => tryInvoke('saved:removePlaylist', id),
  radioLoad: (): Promise<{ stations: IpcRadioStation[] }> => tryInvoke('radio:load'),
  radioSave: (stations: IpcRadioStation[]): Promise<boolean> => tryInvoke('radio:save', stations),
  youtubeLogin: (): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    tryInvoke('yt:login'),
  youtubeLogout: (): Promise<{ success: boolean; error?: string }> => tryInvoke('yt:logout'),
  youtubeImportCookies: (): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    tryInvoke('yt:importCookies'),
  youtubeExportCookies: (): Promise<{ success: boolean; canceled?: boolean; error?: string }> =>
    tryInvoke('yt:exportCookies'),
  youtubeSubscriptions: (): Promise<IpcSubscription[]> => tryInvoke('yt:subs:list'),
  youtubeAddSubscription: (input: {
    channelId: string;
    channelTitle: string;
    channelThumbnail: string;
    downloadPrefs?: IpcSubscriptionDownloadPrefs;
    seedBaseline?: boolean;
  }): Promise<IpcSubscription | null> => tryInvoke('yt:subs:add', input),
  youtubeRemoveSubscription: (channelId: string): Promise<boolean> =>
    tryInvoke('yt:subs:remove', channelId),
  youtubeUpdateSubscription: (
    channelId: string,
    patch: IpcSubscriptionPatch
  ): Promise<IpcSubscription | null> => tryInvoke('yt:subs:update', channelId, patch),
  youtubeCheckSubscriptions: (): Promise<IpcSubscriptionCheckResult> =>
    tryInvoke('yt:subs:checkNow'),
  pluginsList: (): Promise<PluginInfo[]> => tryInvoke('plugins:list'),
  pluginsGet: (id: string): Promise<IpcPluginGetResult> => tryInvoke('plugins:get', id),
  pluginsToggle: (id: string, enabled: boolean): Promise<boolean> =>
    tryInvoke('plugins:toggle', id, enabled),
  pluginsUninstall: (id: string): Promise<IpcPluginUninstallResult> =>
    tryInvoke('plugins:uninstall', id),
  pluginsInstallFromFolder: (): Promise<IpcPluginInstallResult> =>
    tryInvoke('plugins:installFromFolder'),
  pluginsStorageKeys: (id: string): Promise<string[]> => tryInvoke('plugins:storage:keys', id),
  pluginsStorageGet: (id: string, key: string): Promise<unknown> =>
    tryInvoke('plugins:storage:get', id, key),
  pluginsStorageSet: (id: string, key: string, value: unknown): Promise<boolean> =>
    tryInvoke('plugins:storage:set', id, key, value),
  pluginsStorageRemove: (id: string, key: string): Promise<boolean> =>
    tryInvoke('plugins:storage:remove', id, key),
  pluginsSettingsGet: (id: string): Promise<Record<string, unknown>> =>
    tryInvoke('plugins:settings:get', id),
  pluginsSettingsSet: (id: string, key: string, value: unknown): Promise<boolean> =>
    tryInvoke('plugins:settings:set', id, key, value),
  pluginsFetch: (id: string, url: string, opts: PluginFetchOptions): Promise<PluginFetchResult> =>
    tryInvoke('plugins:fetch', id, url, opts)
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
