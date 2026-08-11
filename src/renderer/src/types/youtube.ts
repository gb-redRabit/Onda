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

export interface YouTubeSearchResult {
  items: YouTubeVideo[];
  nextPageToken?: string;
  prevPageToken?: string;
  totalResults?: number;
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

export interface YouTubeResolveMeta {
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
}

export interface YouTubeChannelResult {
  channel: YouTubeChannel;
  items: YouTubeVideo[];
  hasMore: boolean;
}

export interface DownloadTask {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  format: string;
  quality: string;
  outputPath: string;
  progress: number;
  speed: string;
  eta: string;
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface Subscription {
  id: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  autoDownload: boolean;
  lastChecked?: number;
  lastVideoId?: string;
  addedAt: number;
}
