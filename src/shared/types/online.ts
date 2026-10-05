import type { IpcDownloadErrorCode, IpcDownloadSource, IpcDownloadTask } from './ipc/download';
import type { IpcCoverSpec, IpcCoverStatus, IpcMetaOverride } from './ipc/download';
import type { IpcSubscription, IpcSubscriptionDownloadPrefs, IpcYoutubeVideo } from './ipc/youtube';

// Rendererowe typy domenowe DERIVUJĄ z kontraktu IPC (jedno źródło prawdy).
// Wcześniej były zadeklarowane niezależnie, więc pole dodane po stronie IPC
// mogło po cichu zniknąć w rendererze. Zachowujemy dotychczasowe nazwy, żeby nie
// ruszać miejsc wywołań.

export type YouTubeVideo = IpcYoutubeVideo;

export type YouTubeResolveKind = 'video' | 'playlist' | 'channel';

export interface YouTubeResolvedItem {
  id: string;
  title: string;
  duration?: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  isPlayable?: boolean;
  // Kanoniczny URL strony — tylko SoundCloud (patrz YouTubeVideo.url).
  url?: string;
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

export type CoverStatus = IpcCoverStatus;
export type CoverSpec = IpcCoverSpec;
export type MetaOverride = IpcMetaOverride;
export type DownloadSource = IpcDownloadSource;
export type DownloadErrorCode = IpcDownloadErrorCode;
export type SubscriptionDownloadPrefs = IpcSubscriptionDownloadPrefs;
export type Subscription = IpcSubscription;

// Renderer pomija `filenameTemplate` (nie jest potrzebny w UI), a `outputDir`
// czyni opcjonalnym — te dwa pola odbiegają od kontraktu IPC i są jedyną różnicą.
export type DownloadTask = Omit<IpcDownloadTask, 'filenameTemplate' | 'outputDir'> & {
  outputDir?: string;
};
