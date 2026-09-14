import type { IpcCoverSpec, IpcMetaOverride } from './download';

export interface IpcYoutubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  duration?: string;
  viewCount?: string;
  publishedAt: string;
  // Canonical page URL — set for SoundCloud items (permalinks cannot be
  // rebuilt from the numeric id). YouTube items may omit it.
  url?: string;
}

export interface IpcYoutubeChannel {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  subscriberCount?: number;
  description?: string;
  videoCount?: number;
  bannerUrl?: string;
}

export interface IpcSubscription {
  id: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  autoDownload: boolean;
  // Platform of the subscribed channel — 'youtube' by default (legacy entries
  // have no field). SoundCloud subscriptions use profile permalinks as
  // channelId and download MP3s via the internal API.
  platform?: 'youtube' | 'soundcloud';
  lastChecked?: number;
  lastVideoId?: string;
  baselineVideoId?: string;
  downloadedVideoIds?: string[];
  queuedVideoIds?: string[];
  pendingCount?: number;
  newArrivals?: number;
  downloadPrefs?: IpcSubscriptionDownloadPrefs;
  addedAt: number;
}

export interface IpcSubscriptionDownloadPrefs {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  audioLanguage?: string;
  cover?: IpcCoverSpec;
  outputDir?: string;
  filenameTemplate?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  metaOverride?: IpcMetaOverride;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
  profileId?: string;
}

export interface IpcSubscriptionPatch {
  autoDownload?: boolean;
  channelTitle?: string;
  channelThumbnail?: string;
  lastChecked?: number;
  lastVideoId?: string;
  baselineVideoId?: string;
  downloadedVideoIds?: string[];
  queuedVideoIds?: string[];
  pendingCount?: number;
  newArrivals?: number;
  downloadPrefs?: IpcSubscriptionDownloadPrefs;
}

export interface IpcSubscriptionCheckResult {
  checked: number;
  newVideos: number;
  queued?: number;
  errors: number;
}

// A user-saved online stream (YT, SoundCloud) for the "Saved" view.
// Only metadata is stored — the stream URL is resolved live on play, so the
// entry never goes stale.
export interface IpcSavedStream {
  id: string;
  title: string;
  thumbnail?: string;
  // Canonical page URL — set for SoundCloud items (permalinks cannot be
  // rebuilt from the numeric id). YouTube items may omit it.
  url?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
  savedAt: number;
}

// A user-saved playlist/channel. The full item list is stored with the entry
// so playback starts instantly from the snapshot; a background sync re-resolves
// the source (yt-dlp) and appends new / drops removed items.
export interface IpcSavedPlaylist {
  id: string;
  kind: 'playlist' | 'channel';
  url: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  totalItems?: number;
  items?: IpcSavedStream[];
  savedAt: number;
}

export interface IpcSavedData {
  tracks: IpcSavedStream[];
  playlists: IpcSavedPlaylist[];
}

// An internet radio station the user added (from a .pls/.m3u/.xspf file or a
// direct stream URL). Playback streams `url` live through the media-server
// proxy — no duration, no seeking.
export interface IpcRadioStation {
  id: string;
  name: string;
  url: string;
  addedAt: number;
}
