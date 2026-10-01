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
  // Kanoniczny URL strony — ustawiany dla elementów SoundCloud (permalinki nie mogą
  // być odtworzone z numerycznego id). Elementy YouTube mogą go pomijać.
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
  // Platforma subskrybowanego kanału — domyślnie 'youtube' (starsze wpisy
  // nie mają pola). Subskrypcje SoundCloud używają permalinków profilu jako
  // channelId i pobierają MP3 przez wewnętrzne API.
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

// Zapisany przez użytkownika strumień online (YT, SoundCloud) dla widoku "Zapisane".
// Przechowywane są tylko metadane — URL strumienia jest rozwiązywany na żywo przy odtwarzaniu, więc
// wpis nigdy się nie zestarzeje.
export interface IpcSavedStream {
  id: string;
  title: string;
  thumbnail?: string;
  // Kanoniczny URL strony — ustawiany dla elementów SoundCloud (permalinki nie mogą
  // być odtworzone z numerycznego id). Elementy YouTube mogą go pomijać.
  url?: string;
  channelTitle?: string;
  channelId?: string;
  duration?: string;
  savedAt: number;
}

// Zapisana przez użytkownika playlista/kanał. Pełna lista elementów jest przechowywana z wpisem,
// żeby odtwarzanie startowało natychmiast z migawki; synchronizacja w tle ponownie rozwiązuje
// źródło (yt-dlp) i dodaje nowe / usuwa usunięte elementy.
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

// Stacja radia internetowego dodana przez użytkownika (z pliku .pls/.m3u/.xspf lub
// bezpośredniego URL strumienia). Odtwarzanie strumieniuje `url` na żywo przez proxy
// serwera mediów — bez czasu trwania, bez przewijania.
export interface IpcRadioStation {
  id: string;
  name: string;
  url: string;
  addedAt: number;
}
