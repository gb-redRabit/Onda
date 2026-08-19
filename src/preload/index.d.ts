import type {
  IpcChannels,
  IpcChannel,
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
  IpcRadioStation
} from '@shared/types/ipc';

interface OndaAPI {
  mediaServerUrl: string;
  getWindowId: () => Promise<number>;
  invoke: <C extends IpcChannel>(
    channel: C,
    ...args: IpcChannels[C]['args']
  ) => Promise<IpcChannels[C]['result']>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
  pipStart: (
    videoSrc: string,
    settings?: {
      position?: string;
      width?: number;
      height?: number;
      startTime?: number;
      subtitle?: unknown;
    }
  ) => Promise<boolean>;
  pipStop: () => Promise<boolean>;
  pipPreviewStart: (opts: {
    position?: string;
    width?: number;
    height?: number;
  }) => Promise<boolean>;
  pipPreviewStop: () => Promise<boolean>;
  pipPreviewUpdate: (opts: {
    position?: string;
    width?: number;
    height?: number;
  }) => Promise<boolean>;
  pipPreload: (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ) => Promise<void>;
  pipLoadTrack: (
    videoSrc: string,
    subtitleData: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ) => Promise<void>;
  checkFfmpeg: () => Promise<{
    installed: boolean;
    version: string | null;
    path: string | null;
    managed: boolean;
  }>;
  checkFfprobe: () => Promise<{
    installed: boolean;
    version: string | null;
    path: string | null;
    managed: boolean;
  }>;
  checkYtdlp: () => Promise<{
    installed: boolean;
    version: string | null;
    path: string | null;
    managed: boolean;
  }>;
  installFfmpeg: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  installYtdlp: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  checkMkvextract: () => Promise<{
    installed: boolean;
    version: string | null;
    path: string | null;
    managed: boolean;
  }>;
  installMkvextract: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  getDependencyPaths: () => Promise<
    Array<{ tool: string; path: string | null; managed: boolean; version: string | null }>
  >;
  checkUpdateYtdlp: () => Promise<{
    updateAvailable: boolean;
    current: string | null;
    latest: string | null;
  }>;
  updateYtdlp: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  removeYtdlp: () => Promise<{ success: boolean; error?: string }>;
  removeFfmpeg: () => Promise<{ success: boolean; error?: string }>;
  removeMkvextract: () => Promise<{ success: boolean; error?: string }>;
  cancelDepInstall: (tool: string) => Promise<boolean>;
  getCover: (filePath: string) => Promise<{ type: 'video' | 'image' | null; data: string | null }>;
  getDuration: (filePath: string) => Promise<number>;
  writeTags: (
    filePath: string,
    tags: Record<string, string | undefined>
  ) => Promise<{ success: boolean; error?: string }>;
  renameFile: (
    oldPath: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string; newPath?: string }>;
  writeCover: (
    filePath: string,
    imageSource: number[] | string
  ) => Promise<{ success: boolean; error?: string }>;
  readCover: (filePath: string) => Promise<{ mime?: string; data?: number[] } | null>;
  openImageDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  openSubtitleDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  musicbrainzSearchRelease: (
    query: string
  ) => Promise<{ success: boolean; releases: MusicbrainzRelease[]; error?: string }>;
  musicbrainzLookupRelease: (
    releaseId: string
  ) => Promise<{ success: boolean; release?: MusicbrainzRelease; error?: string }>;
  musicbrainzGetCoverData: (
    releaseId: string
  ) => Promise<{ success: boolean; data?: number[]; mime?: string; error?: string }>;
  getFilePath: (file: File) => string;
  listEmbeddedSubtitles: (
    filePath: string
  ) => Promise<Array<{ index: number; language: string; title: string; codec: string }>>;
  extractEmbeddedSubtitle: (
    filePath: string,
    streamIndex: number
  ) => Promise<{ content: string; format: string } | null>;
  findExternalSubtitles: (
    videoPath: string
  ) => Promise<Array<{ name: string; path: string; format: string }>>;
  readSubtitleFile: (filePath: string) => Promise<string | null>;
  extractSubtitleFonts: (
    filePath: string
  ) => Promise<Array<{ name: string; ext: string; data: number[] }>>;
  getPlaybackPosition: (filePath: string) => Promise<number>;
  setPlaybackPosition: (filePath: string, position: number) => Promise<void>;
  clearPlaybackPosition: (filePath: string) => Promise<void>;
  pipUpdateSubtitle: (
    data: {
      subContent: string;
      fonts: Array<{ name: string; data: number[] }>;
      availableFonts: Record<string, string>;
    } | null
  ) => Promise<void>;
  checkAudioCodec: (filePath: string) => Promise<{ codec: string; supported: boolean } | null>;
  transcodeAudio: (filePath: string) => Promise<string | null>;
  transcodeAudioChunk: (
    filePath: string,
    startTime: number,
    duration: number
  ) => Promise<string | null>;
  transcodeVideo: (filePath: string) => Promise<string | null>;
  audioPipShow: (
    state: Record<string, unknown>,
    mode?: string,
    opacity?: number,
    position?: string
  ) => Promise<boolean>;
  audioPipHide: () => Promise<boolean>;
  audioPipAutoHide: () => Promise<boolean>;
  audioPipUpdate: (
    state: Record<string, unknown>,
    mode?: string,
    opacity?: number,
    position?: string
  ) => Promise<boolean>;
  audioPipPreviewStart: (opts: {
    mode?: string;
    position?: string;
    opacity?: number;
  }) => Promise<boolean>;
  audioPipPreviewStop: () => Promise<boolean>;
  audioPipPreviewUpdate: (opts: {
    mode?: string;
    position?: string;
    opacity?: number;
  }) => Promise<boolean>;
  getAppInfo: () => Promise<AppInfo>;
  getAutoLaunch: () => Promise<{ enabled: boolean; hidden: boolean }>;
  setAutoLaunch: (opts: { enabled: boolean; hidden?: boolean }) => Promise<boolean>;
  cancelLibraryScan: () => Promise<boolean>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
  getLicenses: () => Promise<Array<{ name: string; version?: string; license?: string }>>;
  readLogs: (lines?: number) => Promise<string>;
  clearLogs: () => Promise<boolean>;
  downloadLog: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  getUpdaterState: () => Promise<UpdaterState>;
  checkForUpdates: () => Promise<{ checking: boolean }>;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<void>;
  youtubeAuthStatus: () => Promise<YoutubeAuthStatus>;
  getStreamUrl: (url: string) => Promise<IpcStreamResult>;
  savedLoad: () => Promise<IpcSavedData>;
  savedSaveTrack: (track: IpcSavedStream) => Promise<boolean>;
  savedRemoveTrack: (id: string) => Promise<boolean>;
  savedSavePlaylist: (playlist: IpcSavedPlaylist) => Promise<boolean>;
  savedRemovePlaylist: (id: string) => Promise<boolean>;
  radioLoad: () => Promise<{ stations: IpcRadioStation[] }>;
  radioSave: (stations: IpcRadioStation[]) => Promise<boolean>;
  youtubeLogin: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  youtubeLogout: () => Promise<{ success: boolean; error?: string }>;
  youtubeImportCookies: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  youtubeExportCookies: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  youtubeSubscriptions: () => Promise<IpcSubscription[]>;
  youtubeAddSubscription: (input: {
    channelId: string;
    channelTitle: string;
    channelThumbnail: string;
    downloadPrefs?: IpcSubscriptionDownloadPrefs;
    seedBaseline?: boolean;
  }) => Promise<IpcSubscription | null>;
  youtubeRemoveSubscription: (channelId: string) => Promise<boolean>;
  youtubeUpdateSubscription: (
    channelId: string,
    patch: IpcSubscriptionPatch
  ) => Promise<IpcSubscription | null>;
  youtubeCheckSubscriptions: () => Promise<IpcSubscriptionCheckResult>;
}

declare global {
  interface Window {
    api: OndaAPI;
  }
}
