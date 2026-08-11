import type { AppSettings, YoutubeAuthMethod } from '../../renderer/src/types/settings';
import type {
  YouTubeResolveResult,
  YouTubeResolvedItem
} from '../../renderer/src/types/youtube';

interface IpcMediaFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  duration?: number;
  type: 'audio' | 'video' | 'image' | 'unknown';
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

export interface MusicbrainzArtistCredit {
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
  'app:getPath': { args: [name: string]; result: string };
  'library:scan': {
    args: [folderPaths: string[]];
    result: { count: number; folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> };
  };
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
      items: IpcYoutubeVideo[];
      nextPageToken: string | null;
      prevPageToken: string | null;
    };
  };
  'yt:authStatus': { args: []; result: YoutubeAuthStatus };
  'yt:resolve': {
    args: [url: string];
    result: { success: boolean; error?: string; result?: YouTubeResolveResult };
  };
  'yt:resolveMore': {
    args: [{ url: string; start: number; end: number }];
    result: { success: boolean; error?: string; items: YouTubeResolvedItem[]; hasMore: boolean; totalItems: number };
  };
  'yt:channel': {
    args: [{ url: string; start?: number; end?: number; tab?: 'videos' | 'shorts' }];
    result: {
      success: boolean;
      error?: string;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
      hasMore: boolean;
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
