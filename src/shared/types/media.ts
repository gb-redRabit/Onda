export interface MediaFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  mimeType: string;
  size: number;
  duration?: number;
  // 'stream' oznacza utwór online (YouTube): path zawiera URL źródła i
  // nie ma za nim lokalnego pliku. Streamy są odtwarzalne z kolejki,
  // ale nigdy nie są utrwalane (biblioteka/playlisty/statystyki).
  type: 'audio' | 'video' | 'image' | 'unknown' | 'stream';
  metadata?: MediaMetadata;
  thumbnail?: string;
  /** Czy aplikacja potrafi pokazać okładkę (osadzony obraz w tagach ALBO towarzyszące wideo). */
  hasCover?: boolean;
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
  format?: string;
  lossless?: boolean;
  /** Współczynnik ReplayGain utworu (liniowy, z tagu). */
  replayGainTrackGain?: number;
  /** Współczynnik ReplayGain albumu (liniowy, z tagu). */
  replayGainAlbumGain?: number;
  /**
   * Znacznik migracji: oba tagi ReplayGain zostały już sprawdzone. Bez niego
   * skan przyrostowy nie wie, czy brak pola oznacza „brak tagu", czy „stary wpis".
   */
  replayGainScanned?: boolean;
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
