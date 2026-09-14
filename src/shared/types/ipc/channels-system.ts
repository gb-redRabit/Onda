import type { IpcFileItem, OpenFileOptions } from './media';
import type { AppInfo, UpdaterState } from './app';
import type { MusicbrainzRelease } from './musicbrainz';
import type {
  IpcPluginGetResult,
  IpcPluginInstallResult,
  IpcPluginUninstallResult,
  PluginFetchOptions,
  PluginFetchResult,
  PluginInfo
} from './plugins';

export interface SystemChannels {
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
  'app:rendererReady': { args: []; result: void };
  'app:setCloseToTray': { args: [value: boolean]; result: boolean };
  'window:minimize': { args: []; result: void };
  'window:maximize': { args: []; result: void };
  'window:close': { args: []; result: void };
  'explorer:create': { args: [path?: string]; result: number | null };
  'explorer:tabMoved': { args: [sourceWindowId: number, path: string]; result: void };
  'explorer:sendTabToMain': { args: [path: string]; result: void };
  'imageViewer:open': {
    args: [files: unknown[], index: number];
    result: number | null;
  };
  'imageViewer:getData': {
    args: [];
    result: { files: unknown[]; index: number } | undefined;
  };
  'imageViewer:close': { args: []; result: void };
  'app:setBackgroundMaterial': { args: [material: string]; result: boolean };
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
  'dep:removeFfprobe': { args: []; result: { success: boolean; error?: string } };
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
    result: {
      success: boolean;
      data?: number[];
      mime?: string;
      error?: string;
      rateLimited?: boolean;
    };
  };
  'musicbrainz:autodetect': {
    args: [query: string];
    result: {
      success: boolean;
      match: 'certain' | 'ambiguous' | 'none';
      releases: MusicbrainzRelease[];
      error?: string;
    };
  };
  'musicbrainz:batchApply': {
    args: [payload: unknown];
    result: { success: boolean; error?: string };
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
  'media:remoteImage': {
    args: [url: string];
    result: string | null;
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
  'coverCache:clear': { args: []; result: { success: boolean; removed?: number; error?: string } };
  'plugins:list': { args: []; result: PluginInfo[] };
  'plugins:get': { args: [id: string]; result: IpcPluginGetResult };
  'plugins:toggle': { args: [id: string, enabled: boolean]; result: boolean };
  'plugins:uninstall': { args: [id: string]; result: IpcPluginUninstallResult };
  'plugins:installFromFolder': { args: []; result: IpcPluginInstallResult };
  'plugins:storage:keys': { args: [id: string]; result: string[] };
  'plugins:storage:get': { args: [id: string, key: string]; result: unknown };
  'plugins:storage:set': { args: [id: string, key: string, value: unknown]; result: boolean };
  'plugins:storage:remove': { args: [id: string, key: string]; result: boolean };
  'plugins:fetch': {
    args: [id: string, url: string, opts: PluginFetchOptions];
    result: PluginFetchResult;
  };
}
