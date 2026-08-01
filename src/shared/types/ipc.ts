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

export interface IpcChannels {
  'fs:getDrives': { args: []; result: unknown[] };
  'fs:readdir': { args: [dirPath: string]; result: void };
  'fs:readdir:batch': { args: []; result: { done: boolean; items: unknown[] } };
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
    args: [options?: unknown];
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
    result: { count: number; folderTypes: Record<string, 'audio' | 'video' | 'mixed'> };
  };
  'library:loadFolders': { args: []; result: string[] };
  'library:saveFolders': { args: [folders: string[]]; result: string[] };
  'library:loadScanned': {
    args: [];
    result: {
      files: IpcMediaFile[];
      folderTypes: Record<string, 'audio' | 'video' | 'mixed'>;
    } | null;
  };
  'library:saveScanned': {
    args: [
      data: { files: IpcMediaFile[]; folderTypes: Record<string, 'audio' | 'video' | 'mixed'> }
    ];
    result: void;
  };
  'playlist:loadAll': { args: []; result: IpcPlaylist[] };
  'playlist:saveAll': { args: [playlists: IpcPlaylist[]]; result: void };
  'settings:get': { args: []; result: Record<string, unknown> };
  'settings:set': { args: [data: Record<string, unknown>]; result: void };
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
  'yt:search': { args: [query: string]; result: unknown };
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
    result: { success: boolean; releases: unknown[]; error?: string };
  };
  'musicbrainz:lookupRelease': {
    args: [releaseId: string];
    result: { success: boolean; release?: unknown; error?: string };
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
}

export type IpcChannel = keyof IpcChannels;
