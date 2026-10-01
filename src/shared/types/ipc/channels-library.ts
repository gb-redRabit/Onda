import type { AppSettings, SecretStorageStatus } from '../settings';
import type { IpcMediaFile, IpcPlaylist } from './media';

export interface LibraryChannels {
  'library:scan': {
    args: [folderPaths: string[]];
    result: { count: number; folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> };
  };
  'library:scanCancel': { args: []; result: boolean };
  'library:loadFolders': { args: []; result: string[] };
  'library:saveFolders': { args: [folders: string[]]; result: string[] };
  // The renderer pulls the scanned files in bounded slices so a 50k-file
  // library never crosses IPC as one huge payload (each slice also yields to
  // the event loop, keeping the first paint smooth).
  'library:loadScannedChunk': {
    args: [offset: number, limit: number];
    result: {
      files: IpcMediaFile[];
      total: number;
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
  'playlist:export': {
    args: [{ id: string; name: string; tracks: string[] }];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'settings:get': { args: []; result: Partial<AppSettings> };
  'settings:set': { args: [data: Partial<AppSettings>]; result: boolean };
  /**
   * How well the platform can protect a stored API key. `weak` means the OS
   * keyring was not found, so the value is obfuscated rather than encrypted —
   * the API keys panel shows this before the user pastes a secret.
   */
  'settings:secretStorageStatus': { args: []; result: SecretStorageStatus };
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
  'media:batchDurations': { args: [paths: string[]]; result: Record<string, number> };
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
}
