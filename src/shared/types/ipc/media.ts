import type { MediaFile } from '../media';

// Wersja „drutowa" pliku biblioteki: te same pola co rendererowy `MediaFile`,
// ale bez ciężkich/opcjonalnych pól, które nie jadą każdym kanałem. Wyprowadzona,
// żeby pole dodane do `MediaFile` nie mogło po cichu zniknąć w kontrakcie IPC.
export type IpcMediaFile = Omit<MediaFile, 'metadata' | 'thumbnail' | 'mtime'>;

export interface IpcPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: IpcMediaFile[];
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IpcFileItem {
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

export interface OpenFileOptions {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: string[];
}
