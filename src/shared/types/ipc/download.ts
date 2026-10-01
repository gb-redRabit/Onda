export type IpcCoverStatus = 'none' | 'fetching' | 'embedded' | 'saved' | 'error';

export interface IpcCoverSpec {
  type: 'none' | 'thumbnail' | 'custom' | 'frame' | 'clip';
  customPath?: string;
  frameTime?: number;
  clipStart?: number;
  clipEnd?: number;
  clipFormat?: 'webm' | 'mp4';
}

export interface IpcMetaOverride {
  artist?: string;
  album?: string;
  year?: string;
}

// Pełna konfiguracja pobierania — kształt payloadu dialogu konfiguracji pobierania
// i zapisanych profili pobierania.
export interface IpcDownloadConfig {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  filenameTemplate?: string;
  cover?: IpcCoverSpec;
  metaOverride?: IpcMetaOverride;
  outputDir?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioLanguage?: string;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
}

export interface IpcDownloadProfile {
  id: string;
  name: string;
  config: IpcDownloadConfig;
}

// Źródło pobierania bezpośredniego z URL (nie-YouTube). `mode: 'http'` strumieniuje URL do
// pliku bez yt-dlp; `mode: 'ytdlp'` to domyślny potok YouTube;
// `mode: 'soundcloud'` rozwiązuje świeży URL progresywnego MP3 przez
// API SoundCloud na starcie próby, a potem strumieniuje go jak http. Sekrety
// nigdy nie są tu przenoszone — tylko referencja `apiKeyId` rozwiązywana w main.
export interface IpcDownloadSource {
  mode: 'http' | 'ytdlp' | 'soundcloud';
  /** ID skonfigurowanego przez użytkownika źródła mediów, które utworzyło to zadanie. */
  sourceId?: string;
  /** API `id` elementu źródła (z mapowania `fields.id` endpointu). Gdy
   *  obecne, ukończone pobieranie zapisuje je jako "downloaded" dla tego źródła. */
  sourceItemId?: string;
  /** Finalna nazwa pliku (z rozszerzeniem) dla trybu http/soundcloud. */
  fileName?: string;
  /** Ref do settings.apiKeys; nagłówki rozwiązywane w main (safeStorage). */
  apiKeyId?: string;
  /** Nazwa nagłówka autoryzacji dla trybu http (domyślnie X-API-Key). */
  headerName?: string;
  /** Dodatkowe nagłówki dla trybu ytdlp (np. Referer strony embed przy HLS). */
  headers?: Record<string, string>;
  /** Włączenie per źródło dla pobrań bezpośrednich z sieci prywatnej/lokalnej. */
  allowPrivateNetwork?: boolean;
}

export interface IpcDownloadJobInput {
  url: string;
  title: string;
  thumbnail?: string;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  outputDir: string;
  filenameTemplate: string;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  playlistTitle?: string;
  cover?: IpcCoverSpec;
  metaOverride?: IpcMetaOverride;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioQuality?: string;
  audioLanguage?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  source?: IpcDownloadSource;
}

export type IpcDownloadErrorCode =
  | 'auth-required'
  | 'bot-block'
  | 'private'
  | 'not-found'
  | 'network'
  | 'proxy'
  | 'dependency'
  // Docelowy dysk/wolumen skończył miejsce (ENOSPC), z yt-dlp lub ze
  // strumienia zapisu Node.
  | 'disk-full'
  // Zasób rozpoznany, ale nieobsługiwany (np. spersonalizowane linki
  // SoundCloud /discover/sets, których API nie obsługuje).
  | 'unsupported'
  | 'unknown';

export type IpcStreamErrorCode = IpcDownloadErrorCode | 'hls' | 'invalid';

export interface IpcStreamResult {
  success: boolean;
  url?: string;
  error?: string;
  code?: IpcStreamErrorCode;
}

export interface IpcDownloadTask {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  outputDir: string;
  filenameTemplate: string;
  progress: number;
  speed: string;
  eta: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  errorCode?: IpcDownloadErrorCode;
  startedAt: number;
  completedAt?: number;
  outputPath?: string;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  playlistTitle?: string;
  cover?: IpcCoverSpec;
  coverStatus: IpcCoverStatus;
  metaOverride?: IpcMetaOverride;
  inLibrary?: boolean;
  fileHash?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  subtitleStatus?: 'none' | 'embedded' | 'saved' | 'missing';
  audioQuality?: string;
  audioLanguage?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  source?: IpcDownloadSource;
}

export interface IpcNewVideosEvent {
  channelId: string;
  channelTitle: string;
  count: number;
  titles: string[];
}
