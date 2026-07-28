export interface MediaFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  duration?: number;
  type: 'audio' | 'video' | 'unknown';
  metadata?: MediaMetadata;
  thumbnail?: string;
  addedAt: number;
  lastPlayed?: number;
  playCount: number;
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

export interface PlayerState {
  currentTrack: MediaFile | null;
  queue: MediaFile[];
  history: MediaFile[];
  isPlaying: boolean;
  isPaused: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  playbackRate: number;
  shuffle: boolean;
  repeat: 'none' | 'all' | 'one';
  equalizerPreset: string;
  equalizerBands: number[];
}
