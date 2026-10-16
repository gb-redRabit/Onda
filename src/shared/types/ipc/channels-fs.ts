import type { IpcFileItem, OpenFileOptions } from './media';

// Kanały systemu plików, dialogów i powłoki (wydzielone z byłego `channels-system.ts`).
export interface FsChannels {
  'fs:getDrives': { args: []; result: IpcFileItem[] };
  'fs:readdir': { args: [dirPath: string]; result: void };
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
  'dialog:openImage': { args: []; result: { canceled: boolean; filePaths: string[] } };
  'dialog:openSubtitle': {
    args: [];
    result: { canceled: boolean; filePaths: string[] };
  };
  'dialog:openFolder': { args: []; result: string[] };
  'dialog:openFolderFiles': { args: []; result: { canceled: boolean; filePaths: string[] } };
  'shell:showItemInFolder': { args: [fullPath: string]; result: void };
  'shell:openTerminal': { args: [dirPath: string]; result: void };
  'shell:openWithDefault': { args: [filePath: string]; result: void };
  'shell:getFileIcon': {
    args: [filePath: string];
    result: string | null;
  };
  'fs:copyPath': { args: [filePath: string]; result: void };
  'fs:readTextFile': { args: [filePath: string]; result: string | null };
  // Zbiorcza weryfikacja istnienia plików (np. sprzątanie sesji po usuniętych plikach).
  'fs:existing': { args: [paths: string[]]; result: string[] };
}
