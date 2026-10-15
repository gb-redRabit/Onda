import type { YouTubeResolveResult, YouTubeResolvedItem } from '../online';
import type {
  ProviderDetectResult,
  ProviderRef,
  RemoteItem,
  RemoteSubscription,
  RemoteSubscriptionInput,
  RemoteSubscriptionPatch
} from '../providers';
import type { MediaSource, SourceEndpoint, SourceFetchResult, SourceItem } from '../sources';
import type {
  IpcDownloadConfig,
  IpcDownloadErrorCode,
  IpcDownloadJobInput,
  IpcDownloadProfile,
  IpcDownloadTask,
  IpcMetaOverride,
  IpcStreamResult
} from './download';
import type { YoutubeAuthStatus } from './app';
import type {
  IpcRadioStation,
  IpcSavedData,
  IpcSavedPlaylist,
  IpcSavedStream,
  IpcSubscription,
  IpcSubscriptionCheckResult,
  IpcSubscriptionDownloadPrefs,
  IpcSubscriptionPatch,
  IpcYoutubeChannel,
  IpcYoutubeVideo
} from './youtube';

export interface OnlineChannels {
  'yt:search': {
    args: [query: string];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      items: IpcYoutubeVideo[];
      nextPageToken: string | null;
      prevPageToken: string | null;
    };
  };
  'yt:authStatus': { args: []; result: YoutubeAuthStatus };
  'yt:stream:get': { args: [url: string]; result: IpcStreamResult };
  'saved:load': { args: []; result: IpcSavedData };
  'saved:saveTrack': { args: [track: IpcSavedStream]; result: boolean };
  'saved:removeTrack': { args: [id: string]; result: boolean };
  'saved:savePlaylist': { args: [playlist: IpcSavedPlaylist]; result: boolean };
  'saved:removePlaylist': { args: [id: string]; result: boolean };
  'radio:load': { args: []; result: { stations: IpcRadioStation[] } };
  'radio:save': { args: [stations: IpcRadioStation[]]; result: boolean };
  'yt:resolve': {
    args: [url: string];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      result?: YouTubeResolveResult;
    };
  };
  'yt:resolveMore': {
    args: [{ url: string; start: number; end: number }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      items: YouTubeResolvedItem[];
      hasMore: boolean;
      totalItems: number;
    };
  };
  'yt:channel': {
    args: [{ url: string; start?: number; end?: number; tab?: 'videos' | 'shorts' }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
      hasMore: boolean;
    };
  };
  'yt:channelAll': {
    args: [{ url: string; tab?: 'videos' | 'shorts' }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
    };
  };
  'yt:login': { args: []; result: { success: boolean; canceled?: boolean; error?: string } };
  'yt:logout': { args: []; result: { success: boolean; error?: string } };
  'yt:importCookies': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'yt:exportCookies': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'yt:subs:list': { args: []; result: IpcSubscription[] };
  'yt:subs:add': {
    args: [
      input: {
        channelId: string;
        channelTitle: string;
        channelThumbnail: string;
        downloadPrefs?: IpcSubscriptionDownloadPrefs;
        seedBaseline?: boolean;
      }
    ];
    result: IpcSubscription | null;
  };
  'yt:subs:remove': { args: [channelId: string]; result: boolean };
  'yt:subs:update': {
    args: [channelId: string, patch: IpcSubscriptionPatch];
    result: IpcSubscription | null;
  };
  'yt:subs:checkNow': { args: []; result: IpcSubscriptionCheckResult };
  'yt:subs:checkChannel': { args: [channelId: string]; result: IpcSubscriptionCheckResult };
  'sc:search': {
    args: [query: string, offset?: number];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      items: IpcYoutubeVideo[];
    };
  };
  'sc:resolve': {
    args: [url: string];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      result?: YouTubeResolveResult;
    };
  };
  'sc:resolveMore': {
    args: [{ url: string; start: number; end: number }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      items: YouTubeResolvedItem[];
      hasMore: boolean;
      totalItems: number | null;
    };
  };
  'sc:channel': {
    args: [{ url: string; start?: number; end?: number }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
      hasMore: boolean;
    };
  };
  'sc:channelAll': {
    args: [{ url: string }];
    result: {
      success: boolean;
      error?: string;
      code?: IpcDownloadErrorCode;
      channel?: IpcYoutubeChannel;
      items: IpcYoutubeVideo[];
    };
  };
  'sc:stream:get': { args: [url: string]; result: IpcStreamResult };
  'yt:download:add': { args: [jobs: IpcDownloadJobInput[]]; result: IpcDownloadTask[] };
  'yt:download:cancel': { args: [id: string]; result: boolean };
  'yt:download:pause': { args: [id: string]; result: boolean };
  'yt:download:resume': { args: [id: string]; result: boolean };
  'yt:download:list': { args: []; result: IpcDownloadTask[] };
  'yt:download:clearFinished': { args: []; result: boolean };
  'yt:download:pauseAll': { args: []; result: boolean };
  'yt:download:resumeAll': { args: []; result: boolean };
  'yt:download:moveToFront': { args: [id: string]; result: boolean };
  'yt:download:move': { args: [id: string, direction: -1 | 1]; result: boolean };
  'yt:download:export': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'yt:download:import': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string; count?: number };
  };
  'yt:download:schedule': { args: [timestamp: number | null]; result: boolean };
  'yt:download:schedule:get': { args: []; result: number | null };
  'yt:download:updateMetadata': {
    args: [filePath: string, meta: IpcMetaOverride];
    result: { success: boolean; error?: string };
  };
  'profiles:list': { args: []; result: IpcDownloadProfile[] };
  'profiles:save': {
    args: [{ id?: string; name: string; config: IpcDownloadConfig }];
    result: IpcDownloadProfile[] | null;
  };
  'profiles:delete': { args: [id: string]; result: IpcDownloadProfile[] };
  'sources:list': { args: []; result: MediaSource[] };
  'sources:downloadDir': { args: []; result: string };
  'sources:pickIcon': {
    args: [];
    result: { success: boolean; canceled?: boolean; dataUrl?: string; error?: string };
  };
  'sources:export': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'sources:import': {
    args: [];
    result: { success: boolean; canceled?: boolean; count?: number; error?: string };
  };
  'sources:save': {
    args: [source: unknown];
    result: { list: MediaSource[]; saved: MediaSource | null; error?: string };
  };
  'sources:delete': { args: [id: string]; result: MediaSource[] };
  'sources:reorder': { args: [ids: string[]]; result: MediaSource[] };
  'sources:test': {
    args: [
      source: unknown,
      endpoint?: SourceEndpoint | null,
      context?: unknown,
      includeRaw?: boolean
    ];
    result: {
      success: boolean;
      error?: string;
      sample?: SourceItem | null;
      raw?: unknown;
      headers?: Record<string, string> | null;
    };
  };
  'sources:fetch': {
    args: [
      source: unknown,
      endpoint?: SourceEndpoint | null,
      opts?: {
        query?: Record<string, string>;
        pageToken?: string;
        page?: number;
        context?: unknown;
      }
    ];
    result: SourceFetchResult;
  };
  'sources:tableRows': {
    args: [source: unknown, endpoint?: SourceEndpoint | null, opts?: { context?: unknown }];
    result: SourceItem[];
  };
  'sources:enqueue': { args: [jobs: IpcDownloadJobInput[]]; result: IpcDownloadTask[] };
  'sources:downloaded': { args: [sourceId: string]; result: string[] };
  'sources:unmarkDownloaded': { args: [sourceId: string, itemIds: string[]]; result: string[] };
  'preview:prepare': { args: []; result: { success: boolean } };
  'preview:openExternal': { args: [url: string]; result: void };
  'preview:setAdblock': { args: [enabled: boolean]; result: boolean };
  // Providery linków (PikPak, MEGA, Drive…): auto-detekcja, przeglądanie folderów
  // i rozwiązywanie bezpośredniego URL. Pobranie idzie przez `yt:download:add`
  // (source.mode = 'provider').
  'providers:detect': { args: [url: string]; result: ProviderDetectResult | null };
  'providers:list': {
    args: [{ ref: ProviderRef; folderId?: string; force?: boolean }];
    result: { success: boolean; error?: string; code?: IpcDownloadErrorCode; items: RemoteItem[] };
  };
  'providers:resolveUrl': {
    args: [{ ref: ProviderRef; itemId: string }];
    result: { success: boolean; error?: string; code?: IpcDownloadErrorCode; url?: string };
  };
  'providers:downloaded': {
    args: [{ provider: string; shareId: string }];
    result: string[];
  };
  'providers:cred:get': { args: [providerId: string]; result: { hasCookie: boolean } };
  'providers:auth:list': {
    args: [];
    result: Array<{
      id: string;
      label: string;
      icon: string;
      hasCookie: boolean;
      required: boolean;
    }>;
  };
  'providers:cred:set': {
    args: [{ providerId: string; cookie: string }];
    result: boolean;
  };
  'providers:cred:clear': { args: [providerId: string]; result: boolean };
  'providers:cred:login': {
    args: [providerId: string];
    result: { success: boolean; canceled?: boolean; error?: string };
  };
  'providers:streamUrl': {
    args: [{ ref: ProviderRef; itemId: string; mime?: string }];
    result: { success: boolean; error?: string; url?: string; streamToken?: string };
  };
  'providers:subs:list': { args: []; result: RemoteSubscription[] };
  'providers:subs:add': {
    args: [input: RemoteSubscriptionInput];
    result: RemoteSubscription | null;
  };
  'providers:subs:remove': { args: [id: string]; result: boolean };
  'providers:subs:update': {
    args: [id: string, patch: RemoteSubscriptionPatch];
    result: RemoteSubscription | null;
  };
  'providers:subs:check': { args: [id: string]; result: RemoteSubscription | null };
  'providers:subs:checkAll': { args: []; result: RemoteSubscription[] };
}
