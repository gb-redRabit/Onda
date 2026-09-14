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

// Full download configuration — the shape of the download config dialog payload
// and the saved download profiles.
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

// Direct-URL (non-YouTube) download source. `mode: 'http'` streams the URL to a
// file without yt-dlp; `mode: 'ytdlp'` is the default YouTube pipeline;
// `mode: 'soundcloud'` resolves a fresh progressive-MP3 URL through the
// SoundCloud API at attempt start, then streams it like http. Secrets
// are never carried here — only an `apiKeyId` reference resolved in main.
export interface IpcDownloadSource {
  mode: 'http' | 'ytdlp' | 'soundcloud';
  /** Finalna nazwa pliku (z rozszerzeniem) dla trybu http/soundcloud. */
  fileName?: string;
  /** Ref do settings.apiKeys; nagłówki rozwiązywane w main (safeStorage). */
  apiKeyId?: string;
  /** Nazwa nagłówka autoryzacji dla trybu http (domyślnie X-API-Key). */
  headerName?: string;
  /** Dodatkowe nagłówki dla trybu ytdlp (np. Referer strony embed przy HLS). */
  headers?: Record<string, string>;
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
  // Resource recognized but not supported (e.g. personalized SoundCloud
  // /discover/sets links, which the API does not serve).
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
