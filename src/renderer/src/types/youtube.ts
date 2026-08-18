export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  duration?: string;
  viewCount?: string;
  publishedAt: string;
  tags?: string[];
}

export type YouTubeResolveKind = 'video' | 'playlist' | 'channel';

export interface YouTubeResolvedItem {
  id: string;
  title: string;
  duration?: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  isPlayable?: boolean;
}

interface YouTubeResolveMeta {
  channelId?: string;
  channelTitle?: string;
  totalItems?: number;
  hasMore?: boolean;
}

export interface YouTubeResolveResult {
  kind: YouTubeResolveKind;
  sourceUrl: string;
  title: string;
  meta: YouTubeResolveMeta;
  items: YouTubeResolvedItem[];
}

export interface YouTubeChannel {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  subscriberCount?: number;
  description?: string;
  videoCount?: number;
  bannerUrl?: string;
}

export type CoverStatus = 'none' | 'fetching' | 'embedded' | 'saved' | 'error';

type DownloadErrorCode =
  | 'auth-required'
  | 'bot-block'
  | 'private'
  | 'not-found'
  | 'network'
  | 'proxy'
  | 'dependency'
  | 'unknown';

export interface CoverSpec {
  type: 'none' | 'thumbnail' | 'custom' | 'frame' | 'clip';
  customPath?: string;
  frameTime?: number;
  clipStart?: number;
  clipEnd?: number;
  clipFormat?: 'webm' | 'mp4';
}

export interface MetaOverride {
  artist?: string;
  album?: string;
  year?: string;
}

export interface DownloadSource {
  mode: 'http' | 'ytdlp';
  fileName?: string;
  apiKeyId?: string;
  headerName?: string;
}

export interface DownloadTask {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  outputPath?: string;
  outputDir?: string;
  progress: number;
  speed: string;
  eta: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  errorCode?: DownloadErrorCode;
  startedAt: number;
  completedAt?: number;
  videoId?: string;
  channelId?: string;
  channelTitle?: string;
  playlistTitle?: string;
  cover?: CoverSpec;
  coverStatus: CoverStatus;
  metaOverride?: MetaOverride;
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
  source?: DownloadSource;
}

export interface SubscriptionDownloadPrefs {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  audioLanguage?: string;
  cover?: CoverSpec;
  outputDir?: string;
  filenameTemplate?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  metaOverride?: MetaOverride;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  profileId?: string;
}

export interface Subscription {
  id: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  autoDownload: boolean;
  lastChecked?: number;
  lastVideoId?: string;
  baselineVideoId?: string;
  downloadedVideoIds?: string[];
  queuedVideoIds?: string[];
  pendingCount?: number;
  newArrivals?: number;
  downloadPrefs?: SubscriptionDownloadPrefs;
  addedAt: number;
}
