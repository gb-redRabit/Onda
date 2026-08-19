export interface MediaFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  duration?: number;
  // 'stream' marks an online (YouTube) track: path holds the source URL and
  // there is no local file backing it. Streams are playable from the queue
  // but are never persisted (library/playlists/stats).
  type: 'audio' | 'video' | 'image' | 'unknown' | 'stream';
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

interface MediaPicture {
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
