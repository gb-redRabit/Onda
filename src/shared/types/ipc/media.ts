export interface IpcMediaFile {
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
