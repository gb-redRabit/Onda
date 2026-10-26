import type { AppSettings, SecretStorageStatus } from '../settings';
import type { SmartPlaylist } from '../smart-playlist';
import type { IpcMediaFile, IpcPlaylist } from './media';

export interface LoudnessAnalysisResult {
  /** Liczba plików, dla których udało się zmierzyć głośność. */
  analyzed: number;
  /** Liczba albumów, którym nadano album gain. */
  albums: number;
  /** Pliki, których nie udało się przeanalizować. */
  failed: number;
  aborted: boolean;
  /** Limit plików na jedno uruchomienie został osiągnięty. */
  truncated: boolean;
  /** Liczba rekordów biblioteki faktycznie zmienionych. */
  updated: number;
  error?: string;
}

export interface LoudnessProgress {
  current: number;
  total: number;
  path?: string;
}

export interface LibraryAddFilesResult {
  /** Nowe pozycje dopisane do biblioteki. */
  added: number;
  /** Pozycje pominięte (duplikaty, nieobsługiwane rozszerzenia, błędy). */
  skipped: number;
  /** Liczba ścieżek przyjętych do przetworzenia. */
  total: number;
  error?: string;
}

export interface LibraryChannels {
  'library:analyzeLoudness': { args: []; result: LoudnessAnalysisResult };
  'library:loudnessCancel': { args: []; result: boolean };
  /** Dodaje konkretne pliki (np. przeciągnięte z systemu) do biblioteki. */
  'library:addFiles': { args: [paths: string[]]; result: LibraryAddFilesResult };
  'library:scan': {
    args: [folderPaths: string[]];
    result: { count: number; folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> };
  };
  'library:scanCancel': { args: []; result: boolean };
  'library:loadFolders': { args: []; result: string[] };
  'library:saveFolders': { args: [folders: string[]]; result: string[] };
  // Renderer pobiera zeskanowane pliki w ograniczonych porcjach, żeby biblioteka
  // 50k plików nigdy nie przekraczała IPC jako jeden ogromny payload (każda porcja
  // ustępuje też pętli zdarzeń, utrzymując płynne pierwsze malowanie).
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
  'smartPlaylists:loadAll': { args: []; result: SmartPlaylist[] };
  'smartPlaylists:saveAll': { args: [playlists: SmartPlaylist[]]; result: void };
  'playlist:export': {
    args: [{ id: string; name: string; tracks: string[] }];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'settings:get': { args: []; result: Partial<AppSettings> };
  'settings:set': { args: [data: Partial<AppSettings>]; result: boolean };
  /**
   * Jak dobrze platforma chroni zapisany klucz API. `weak` oznacza, że nie
   * znaleziono keyringu systemu, więc wartość jest zaciemniona, a nie zaszyfrowana —
   * panel kluczy API pokazuje to, zanim użytkownik wklei sekret.
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
  'media:getVideoFps': { args: [filePath: string]; result: number };
  'media:saveScreenshot': {
    args: [videoPath: string, data: number[], timeSec: number];
    result: { success: boolean; path?: string; error?: string };
  };
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
