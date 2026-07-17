export interface YouTubeVideo {
  id: string
  title: string
  description: string
  thumbnail: string
  channelTitle: string
  channelId: string
  duration?: string
  viewCount?: string
  publishedAt: string
  tags?: string[]
}

export interface YouTubeChannel {
  id: string
  title: string
  description: string
  thumbnail: string
  subscriberCount: string
  videoCount: string
}

export interface YouTubePlaylist {
  id: string
  title: string
  description: string
  thumbnail: string
  videoCount: string
  channelTitle: string
}

export interface YouTubeSearchResult {
  items: YouTubeVideo[]
  nextPageToken?: string
  prevPageToken?: string
  totalResults?: number
}

export interface DownloadTask {
  id: string
  url: string
  title: string
  thumbnail?: string
  format: string
  quality: string
  outputPath: string
  progress: number
  speed: string
  eta: string
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled'
  error?: string
  startedAt: number
  completedAt?: number
}

export interface Subscription {
  id: string
  channelId: string
  channelTitle: string
  channelThumbnail: string
  autoDownload: boolean
  lastChecked?: number
  lastVideoId?: string
  addedAt: number
}
