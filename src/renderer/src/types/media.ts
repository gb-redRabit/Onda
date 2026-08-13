export interface MediaFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  duration?: number;
  type: 'audio' | 'video' | 'image' | 'unknown';
  metadata?: MediaMetadata;
  thumbnail?: string;
  addedAt: number;
  lastPlayed?: number;
  playCount: number;
  mtime?: number;
}

export interface MediaMetadata {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  track?: { no: number; of?: number };
  disk?: { no: number; of?: number };
  picture?: MediaPicture[];
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  codec?: string;
  lossless?: boolean;
  replayGainTrackGain?: number;
}

export interface MediaPicture {
  format: string;
  data: Uint8Array;
  type?: string;
  description?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: MediaFile[];
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
}
