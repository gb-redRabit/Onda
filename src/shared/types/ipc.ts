import type { AppSettings, YoutubeAuthMethod } from '../../renderer/src/types/settings';
import type { YouTubeResolveResult, YouTubeResolvedItem } from '../../renderer/src/types/youtube';
import type {
  MediaSource,
  SourceEndpoint,
  SourceFetchResult,
  SourceItem
} from '../../renderer/src/types/sources';

interface IpcMediaFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  duration?: number;
  type: 'audio' | 'video' | 'image' | 'unknown' | 'stream';
  addedAt: number;
  lastPlayed?: number;
  playCount: number;
}

interface IpcPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: IpcMediaFile[];
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

interface IpcFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  createdAt: number;
  extension?: string;
  mimeType?: string;
  thumbnail?: string;
}

interface OpenFileOptions {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: string[];
}

interface MusicbrainzArtistCredit {
  name?: string;
  artist?: { name?: string };
}

export interface MusicbrainzRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
  'track-count'?: number;
  'artist-credit'?: MusicbrainzArtistCredit[];
  media?: Array<{
    tracks: Array<{
      id?: string;
      number?: string;
      position?: string;
      title: string;
    }>;
  }>;
}

export interface IpcYoutubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  duration?: string;
  viewCount?: string;
  publishedAt: string;
}

interface IpcYoutubeChannel {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  subscriberCount?: number;
  description?: string;
  videoCount?: number;
  bannerUrl?: string;
}

export interface IpcSubscription {
  id: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  autoDownload: boolean;
  lastChecked?: number;
  lastVideoId?: string;
  baselineVideoId?: string;
  downloadedVideoIds?: string[];
  queuedVideoIds?: string[];
  pendingCount?: number;
  newArrivals?: number;
  downloadPrefs?: IpcSubscriptionDownloadPrefs;
  addedAt: number;
}

export interface IpcSubscriptionDownloadPrefs {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  audioLanguage?: string;
  cover?: IpcCoverSpec;
  outputDir?: string;
  filenameTemplate?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  metaOverride?: IpcMetaOverride;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  profileId?: string;
}

export interface IpcSubscriptionPatch {
  autoDownload?: boolean;
  channelTitle?: string;
  channelThumbnail?: string;
  lastChecked?: number;
  lastVideoId?: string;
  baselineVideoId?: string;
  downloadedVideoIds?: string[];
  queuedVideoIds?: string[];
  pendingCount?: number;
  newArrivals?: number;
  downloadPrefs?: IpcSubscriptionDownloadPrefs;
}

export interface IpcSubscriptionCheckResult {
  checked: number;
  newVideos: number;
  queued?: number;
  errors: number;
}

type IpcCoverStatus = 'none' | 'fetching' | 'embedded' | 'saved' | 'error';

export interface IpcCoverSpec {
  type: 'none' | 'thumbnail' | 'custom' | 'frame' | 'clip';
  customPath?: string;
  frameTime?: number;
  clipStart?: number;
  clipEnd?: number;
  clipFormat?: 'webm' | 'mp4';
}

export interface IpcMetaOverride {
  artist?: string;
  album?: string;
  year?: string;
}

// Full download configuration — the shape of the download config dialog payload
// and the saved download profiles.
export interface IpcDownloadConfig {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  filenameTemplate?: string;
  cover?: IpcCoverSpec;
  metaOverride?: IpcMetaOverride;
  outputDir?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioLanguage?: string;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
}

export interface IpcDownloadProfile {
  id: string;
  name: string;
  config: IpcDownloadConfig;
}

// Direct-URL (non-YouTube) download source. `mode: 'http'` streams the URL to a
// file without yt-dlp; `mode: 'ytdlp'` is the default YouTube pipeline. Secrets
// are never carried here — only an `apiKeyId` reference resolved in main.
interface IpcDownloadSource {
  mode: 'http' | 'ytdlp';
  /** Finalna nazwa pliku (z rozszerzeniem) dla trybu http. */
  fileName?: string;
  /** Ref do settings.apiKeys; nagłówki rozwiązywane w main (safeStorage). */
  apiKeyId?: string;
  /** Nazwa nagłówka autoryzacji dla trybu http (domyślnie X-API-Key). */
  headerName?: string;
  /** Dodatkowe nagłówki dla trybu ytdlp (np. Referer strony embed przy HLS). */
  headers?: Record<string, string>;
}

export interface IpcDownloadJobInput {
  url: string;
  title: string;
  thumbnail?: string;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  outputDir: string;
  filenameTemplate: string;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  playlistTitle?: string;
  cover?: IpcCoverSpec;
  metaOverride?: IpcMetaOverride;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioQuality?: string;
  audioLanguage?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  source?: IpcDownloadSource;
}

export type IpcDownloadErrorCode =
  | 'auth-required'
  | 'bot-block'
  | 'private'
  | 'not-found'
  | 'network'
  | 'proxy'
  | 'dependency'
  | 'unknown';

export type IpcStreamErrorCode = IpcDownloadErrorCode | 'hls' | 'invalid';

export interface IpcStreamResult {
  success: boolean;
  url?: string;
  error?: string;
  code?: IpcStreamErrorCode;
}

// A user-saved online stream (YT, later SoundCloud) for the "Saved" view.
// Only metadata is stored — the stream URL is resolved live on play, so the
// entry never goes stale.
export interface IpcSavedStream {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
  savedAt: number;
}

// A user-saved playlist/channel. The full item list is stored with the entry
// so playback starts instantly from the snapshot; a background sync re-resolves
// the source (yt-dlp) and appends new / drops removed items.
export interface IpcSavedPlaylist {
  id: string;
  kind: 'playlist' | 'channel';
  url: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  totalItems?: number;
  items?: IpcSavedStream[];
  savedAt: number;
}

export interface IpcSavedData {
  tracks: IpcSavedStream[];
  playlists: IpcSavedPlaylist[];
}

// An internet radio station the user added (from a .pls/.m3u/.xspf file or a
// direct stream URL). Playback streams `url` live through the media-server
// proxy — no duration, no seeking.
export interface IpcRadioStation {
  id: string;
  name: string;
  url: string;
  addedAt: number;
}

export interface IpcDownloadTask {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  outputDir: string;
  filenameTemplate: string;
  progress: number;
  speed: string;
  eta: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  errorCode?: IpcDownloadErrorCode;
  startedAt: number;
  completedAt?: number;
  outputPath?: string;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  playlistTitle?: string;
  cover?: IpcCoverSpec;
  coverStatus: IpcCoverStatus;
  metaOverride?: IpcMetaOverride;
  inLibrary?: boolean;
  fileHash?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  subtitleStatus?: 'none' | 'embedded' | 'saved' | 'missing';
  audioQuality?: string;
  audioLanguage?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  source?: IpcDownloadSource;
}

export interface IpcNewVideosEvent {
  channelId: string;
  channelTitle: string;
  count: number;
  titles: string[];
}

export interface YoutubeAuthStatus {
  method: YoutubeAuthMethod;
  loggedIn: boolean;
  cookiesPath?: string;
  browser?: string;
  lastLogin?: number | null;
  error?: string;
}

export interface AppInfo {
  appName: string;
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  v8: string;
  os: string;
  platform: string;
  arch: string;
  userDataPath: string;
  logPath: string;
  uptime: number;
}

export interface UpdaterState {
  status:
    'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  current: string;
  version: string;
  progress: number;
  error: string;
  enabled: boolean;
}

export interface IpcChannels {
  'fs:getDrives': { args: []; result: IpcFileItem[] };
  'fs:readdir': { args: [dirPath: string]; result: void };
  'fs:readdir:batch': {
    args: [];
    result: { done: boolean; items: IpcFileItem[]; error?: string };
  };
  'fs:mkdir': { args: [dirPath: string]; result: boolean };
  'fs:delete': { args: [filePath: string]; result: void };
  'fs:move': { args: [paths: string[], destination: string]; result: void };
  'fs:copy': { args: [paths: string[], destination: string]; result: void };
  'fs:findDuplicates': {
    args: [directory: string];
    result: { original: string; duplicates: string[] }[];
  };
  'fs:getProperties': {
    args: [filePath: string];
    result: {
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
      createdAt: number;
      modifiedAt: number;
      itemCount?: number;
      dirCount?: number;
      fileCount?: number;
      totalSize?: number;
      truncated?: boolean;
    } | null;
  };
  'dialog:openFile': {
    args: [options?: OpenFileOptions];
    result: { canceled: boolean; filePaths: string[] };
  };
  'dialog:openSubtitle': {
    args: [];
    result: { canceled: boolean; filePaths: string[] };
  };
  'dialog:openFolder': { args: []; result: string[] };
  'dialog:openFolderFiles': { args: []; result: { canceled: boolean; filePaths: string[] } };
  'app:quit': { args: []; result: void };
  'window:minimize': { args: []; result: void };
  'window:maximize': { args: []; result: void };
  'window:close': { args: []; result: void };
  'explorer:create': { args: [path?: string]; result: number | null };
  'explorer:tabMoved': { args: [sourceWindowId: number, path: string]; result: void };
  'explorer:sendTabToMain': { args: [path: string]; result: void };
  'window:setAlwaysOnTop': { args: [flag: boolean]; result: void };
  'window:toggleFullscreen': { args: []; result: boolean };
  'window:exitFullscreen': { args: []; result: void };
  'window:isFullscreen': { args: []; result: boolean };
  'shell:showItemInFolder': { args: [fullPath: string]; result: void };
  'shell:openTerminal': { args: [dirPath: string]; result: void };
  'shell:openWithDefault': { args: [filePath: string]; result: void };
  'fs:copyPath': { args: [filePath: string]; result: void };
  'fs:readTextFile': { args: [filePath: string]; result: string | null };
  'app:getPath': { args: [name: string]; result: string };
  'app:readClipboard': { args: []; result: string };
  'app:getPendingFiles': { args: []; result: string[] };
  'library:scan': {
    args: [folderPaths: string[]];
    result: { count: number; folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> };
  };
  'library:scanCancel': { args: []; result: boolean };
  'library:loadFolders': { args: []; result: string[] };
  'library:saveFolders': { args: [folders: string[]]; result: string[] };
  'library:loadScanned': {
    args: [];
    result: {
      files: IpcMediaFile[];
      folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
    } | null;
  };
  'library:saveScanned': {
    args: [
      data: {
        files: IpcMediaFile[];
        folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
      }
    ];
    result: void;
  };
  'library:updateStats': {
    args: [{ path: string; playCount: number; lastPlayed: number }[]];
    result: void;
  };
  'playlist:loadAll': { args: []; result: IpcPlaylist[] };
  'playlist:saveAll': { args: [playlists: IpcPlaylist[]]; result: void };
  'settings:get': { args: []; result: Partial<AppSettings> };
  'settings:set': { args: [data: Partial<AppSettings>]; result: boolean };
  'settings:export': { args: []; result: { success: boolean; canceled?: boolean; error?: string } };
  'settings:import': {
    args: [];
    result: {
      success: boolean;
      canceled?: boolean;
      data?: Partial<AppSettings>;
      error?: string;
    };
  };
  'media:getCover': {
    args: [filePath: string];
    result: { type: 'video' | 'image' | null; data: string | null };
  };
  'media:getDuration': { args: [filePath: string]; result: number };
  'media:writeTags': {
    args: [filePath: string, tags: Record<string, string | undefined>];
    result: { success: boolean; error?: string };
  };
  'media:renameFile': {
    args: [oldPath: string, newName: string];
    result: { success: boolean; error?: string; newPath?: string };
  };
  'media:writeCover': {
    args: [filePath: string, imageSource: number[] | string];
    result: { success: boolean; error?: string };
  };
  'media:readCover': {
    args: [filePath: string];
    result: { mime?: string; data?: number[] } | null;
  };
  'playback:getPosition': { args: [filePath: string]; result: number };
  'playback:setPosition': { args: [filePath: string, position: number]; result: void };
  'playback:clearPosition': { args: [filePath: string]; result: void };
  'yt:search': {
    args: [query: string];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      items: IpcYoutubeVideo[];
      nextPageToken: string | null;
      prevPageToken: string | null;
    };
  };
  'yt:authStatus': { args: []; result: YoutubeAuthStatus };
  'yt:stream:get': { args: [url: string]; result: IpcStreamResult };
  'saved:load': { args: []; result: IpcSavedData };
  'saved:saveTrack': { args: [track: IpcSavedStream]; result: boolean };
  'saved:removeTrack': { args: [id: string]; result: boolean };
  'saved:savePlaylist': { args: [playlist: IpcSavedPlaylist]; result: boolean };
  'saved:removePlaylist': { args: [id: string]; result: boolean };
  'radio:load': { args: []; result: { stations: IpcRadioStation[] } };
  'radio:save': { args: [stations: IpcRadioStation[]]; result: boolean };
  'yt:resolve': {
    args: [url: string];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      result?: YouTubeResolveResult;
    };
  };
  'yt:resolveMore': {
    args: [{ url: string; start: number; end: number }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      items: YouTubeResolvedItem[];
      hasMore: boolean;
      totalItems: number;
    };
  };
  'yt:channel': {
    args: [{ url: string; start?: number; end?: number; tab?: 'videos' | 'shorts' }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
      hasMore: boolean;
    };
  };
  'yt:channelAll': {
    args: [{ url: string; tab?: 'videos' | 'shorts' }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
    };
  };
  'yt:login': { args: []; result: { success: boolean; canceled?: boolean; error?: string } };
  'yt:logout': { args: []; result: { success: boolean; error?: string } };
  'yt:importCookies': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'yt:exportCookies': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'yt:subs:list': { args: []; result: IpcSubscription[] };
  'yt:subs:add': {
    args: [
      input: {
        channelId: string;
        channelTitle: string;
        channelThumbnail: string;
        downloadPrefs?: IpcSubscriptionDownloadPrefs;
        seedBaseline?: boolean;
      }
    ];
    result: IpcSubscription | null;
  };
  'yt:subs:remove': { args: [channelId: string]; result: boolean };
  'yt:subs:update': {
    args: [channelId: string, patch: IpcSubscriptionPatch];
    result: IpcSubscription | null;
  };
  'yt:subs:checkNow': { args: []; result: IpcSubscriptionCheckResult };
  'yt:subs:checkChannel': { args: [channelId: string]; result: IpcSubscriptionCheckResult };
  'yt:download:add': { args: [jobs: IpcDownloadJobInput[]]; result: IpcDownloadTask[] };
  'yt:download:cancel': { args: [id: string]; result: boolean };
  'yt:download:pause': { args: [id: string]; result: boolean };
  'yt:download:resume': { args: [id: string]; result: boolean };
  'yt:download:list': { args: []; result: IpcDownloadTask[] };
  'yt:download:clearFinished': { args: []; result: boolean };
  'yt:download:pauseAll': { args: []; result: boolean };
  'yt:download:resumeAll': { args: []; result: boolean };
  'yt:download:moveToFront': { args: [id: string]; result: boolean };
  'yt:download:move': { args: [id: string, direction: -1 | 1]; result: boolean };
  'yt:download:export': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'yt:download:import': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string; count?: number };
  };
  'yt:download:schedule': { args: [timestamp: number | null]; result: boolean };
  'yt:download:schedule:get': { args: []; result: number | null };
  'yt:download:updateMetadata': {
    args: [filePath: string, meta: IpcMetaOverride];
    result: { success: boolean; error?: string };
  };
  'profiles:list': { args: []; result: IpcDownloadProfile[] };
  'profiles:save': {
    args: [{ id?: string; name: string; config: IpcDownloadConfig }];
    result: IpcDownloadProfile[] | null;
  };
  'profiles:delete': { args: [id: string]; result: IpcDownloadProfile[] };
  'sources:list': { args: []; result: MediaSource[] };
  'sources:downloadDir': { args: []; result: string };
  'sources:pickIcon': {
    args: [];
    result: { success: boolean; canceled?: boolean; dataUrl?: string; error?: string };
  };
  'sources:export': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'sources:import': {
    args: [];
    result: { success: boolean; canceled?: boolean; count?: number; error?: string };
  };
  'sources:save': {
    args: [source: unknown];
    result: { list: MediaSource[]; saved: MediaSource | null; error?: string };
  };
  'sources:delete': { args: [id: string]; result: MediaSource[] };
  'sources:test': {
    args: [source: unknown, endpoint?: SourceEndpoint | null];
    result: { success: boolean; error?: string; sample?: SourceItem | null };
  };
  'sources:fetch': {
    args: [
      source: unknown,
      endpoint?: SourceEndpoint | null,
      opts?: {
        query?: Record<string, string>;
        pageToken?: string;
        page?: number;
        context?: unknown;
      }
    ];
    result: SourceFetchResult;
  };
  'sources:tableRows': {
    args: [source: unknown, endpoint?: SourceEndpoint | null, opts?: { context?: unknown }];
    result: SourceItem[];
  };
  'sources:enqueue': { args: [jobs: IpcDownloadJobInput[]]; result: IpcDownloadTask[] };
  'dep:checkFfmpeg': { args: []; result: { installed: boolean; version: string | null } };
  'dep:checkYtdlp': {
    args: [];
    result: { installed: boolean; version: string | null; path: string | null };
  };
  'dep:checkFfprobe': { args: []; result: { installed: boolean; version: string | null } };
  'dep:installFfmpeg': { args: []; result: { success: boolean; error?: string } };
  'dep:installYtdlp': { args: []; result: { success: boolean; error?: string } };
  'dep:checkMkvextract': { args: []; result: { installed: boolean; version: string | null } };
  'dep:installMkvextract': { args: []; result: { success: boolean; error?: string } };
  'musicbrainz:searchRelease': {
    args: [query: string];
    result: { success: boolean; releases: MusicbrainzRelease[]; error?: string };
  };
  'musicbrainz:lookupRelease': {
    args: [releaseId: string];
    result: { success: boolean; release?: MusicbrainzRelease; error?: string };
  };
  'musicbrainz:getCoverData': {
    args: [releaseId: string];
    result: { success: boolean; data?: number[]; mime?: string; error?: string };
  };
  'media:checkAudioCodec': {
    args: [filePath: string];
    result: { codec: string; supported: boolean } | null;
  };
  'media:transcodeAudio': {
    args: [filePath: string];
    result: string | null;
  };
  'media:transcodeAudioChunk': {
    args: [filePath: string, startTime: number, duration: number];
    result: string | null;
  };
  'media:transcodeVideo': {
    args: [filePath: string];
    result: string | null;
  };
  'shell:getFileIcon': {
    args: [filePath: string];
    result: string | null;
  };
  'media:getThumbnail': {
    args: [filePath: string, maxSize?: number];
    result: string | null;
  };
  'media:batchThumbnails': {
    args: [files: string[], maxSize?: number];
    result: Record<string, string>;
  };
  'media:grantAccess': { args: [filePath: string]; result: boolean };
  'app:getInfo': { args: []; result: AppInfo };
  'app:getLicenses': {
    args: [];
    result: Array<{ name: string; version?: string; license?: string }>;
  };
  'diagnostics:readLogs': { args: [lines?: number]; result: string };
  'diagnostics:clearLogs': { args: []; result: boolean };
  'diagnostics:downloadLog': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'updater:getState': { args: []; result: UpdaterState };
  'updater:check': { args: []; result: { checking: boolean } };
  'updater:download': { args: []; result: boolean };
  'updater:install': { args: []; result: void };
}

export type IpcChannel = keyof IpcChannels;
