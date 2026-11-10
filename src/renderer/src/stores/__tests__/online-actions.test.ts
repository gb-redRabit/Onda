import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  notify: vi.fn(),
  player: {
    streamPending: null as unknown,
    currentTrack: null as unknown,
    enrichTrack: vi.fn(),
    setTrack: vi.fn()
  },
  invoke: vi.fn(),
  on: vi.fn(),
  upsertTask: vi.fn(),
  addSubscription: vi.fn(),
  markVideoDownloaded: vi.fn(),
  loadDownloads: vi.fn(),
  loadSubscriptions: vi.fn(),
  openChannel: vi.fn(),
  queueChannelVideos: vi.fn(),
  prefetch: vi.fn(),
  playAllStreams: vi.fn(),
  channelUrl: vi.fn((prefix: { platform: string; name: string }) => `url:${prefix.name}`),
  streamTarget: vi.fn((video: { id: string }) => `yt:${video.id}`),
  buildTrack: vi.fn((video: { id: string; title?: string }, url: string, start: number) => ({
    id: `track:${video.id}`,
    path: url,
    start
  })),
  streamChannel: vi.fn((url: string) => `stream:${url}`),
  streamError: vi.fn((_t: unknown, code: string) => `error:${code}`),
  toTask: vi.fn((task: unknown) => ({ converted: task })),
  removeSubscription: vi.fn(),
  getSubscription: vi.fn(),
  addSub: vi.fn(),
  subscriptions: [] as unknown[],
  downloads: [] as unknown[],
  resolved: [] as unknown[]
}));

vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: h.t } } }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/utils/onlineHelpers', () => ({
  streamTargetFor: h.streamTarget,
  streamChannelFor: h.streamChannel,
  streamErrorMessage: h.streamError,
  buildStreamTrack: h.buildTrack
}));
vi.mock('@renderer/utils/onlineDownloadTask', () => ({ toDownloadTask: h.toTask }));
vi.mock('@renderer/utils/onlineChannel', () => ({ channelUrlForPrefix: h.channelUrl }));
vi.mock('@renderer/utils/streamPrefetch', () => ({
  createStreamPrefetcher: () => ({ prefetch: h.prefetch })
}));
vi.mock('../online/search', () => ({
  createOnlineSearch: () => ({
    searchResults: ref([]),
    searchQuery: ref(''),
    isSearching: ref(false),
    nextToken: ref(null),
    prevToken: ref(null),
    searchPage: ref(0),
    hasMoreSc: ref(false),
    searchLoadingMore: ref(false),
    pagedResults: ref([]),
    hasNextPage: ref(false),
    hasPrevPage: ref(false),
    searchOnline: vi.fn(),
    loadMoreSearch: vi.fn(),
    setResults: vi.fn(),
    nextSearchPage: vi.fn(),
    prevSearchPage: vi.fn(),
    clearSearch: vi.fn()
  })
}));
vi.mock('../online/subscriptions', () => ({
  createOnlineSubscriptions: () => ({
    subscriptions: h.subscriptions,
    subscriptionsLoaded: ref(false),
    addSubscription: h.addSubscription,
    removeSubscription: h.removeSubscription,
    isSubscribed: vi.fn(),
    getSubscription: h.getSubscription,
    isVideoDownloaded: vi.fn(),
    markVideoDownloaded: h.markVideoDownloaded,
    loadSubscriptions: h.loadSubscriptions
  })
}));
vi.mock('../online/downloads', () => ({
  createOnlineDownloads: () => ({
    downloads: h.downloads,
    upsertTask: h.upsertTask,
    submitJobs: vi.fn(),
    downloadStatusFor: vi.fn(),
    coverStatusFor: vi.fn(),
    loadDownloads: h.loadDownloads,
    addTask: vi.fn(),
    cancelDownload: vi.fn(),
    pauseDownload: vi.fn(),
    resumeDownload: vi.fn(),
    retryDownload: vi.fn(),
    retryCover: vi.fn(),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    moveToFront: vi.fn(),
    move: vi.fn(),
    exportQueue: vi.fn(),
    importQueue: vi.fn(),
    scheduleStart: vi.fn(),
    getScheduledStart: vi.fn(),
    updateMetadata: vi.fn(),
    clearFinishedDownloads: vi.fn()
  })
}));
vi.mock('../online/resolved', () => ({
  createOnlineResolved: () => ({
    resolved: h.resolved,
    isResolving: ref(false),
    resolvedLoading: ref(false),
    resolvedCapped: ref(false),
    selectedResolved: ref(null),
    setResolved: vi.fn(),
    loadMoreResolved: vi.fn()
  })
}));
vi.mock('../online/channel', () => ({
  createOnlineChannel: () => ({
    channel: ref(null),
    channelTab: ref('videos'),
    channelHasShorts: ref(false),
    channelViewMode: ref('grid'),
    channelLoading: ref(false),
    channelError: ref(''),
    channelErrorCode: ref(''),
    channelVideos: ref([]),
    channelShorts: ref([]),
    channelIsSc: ref(false),
    channelItems: ref([]),
    channelHasMore: ref(false),
    openChannel: h.openChannel,
    switchChannelTab: vi.fn(),
    loadMoreChannel: vi.fn(),
    setChannelViewMode: vi.fn(),
    closeChannel: vi.fn()
  })
}));
vi.mock('../online/queue', () => ({
  createOnlineQueue: () => ({
    queuingIds: ref([]),
    isQueuing: vi.fn(),
    queueingChannelIds: ref([]),
    isChannelQueuing: vi.fn(),
    resolveOnline: vi.fn(),
    queueFromResolved: vi.fn(),
    queueVideo: vi.fn(),
    queueChannelVideos: h.queueChannelVideos,
    queueBatch: vi.fn(),
    loadAllResolvedItems: vi.fn()
  })
}));
vi.mock('../online/subscriptionActions', () => ({
  createOnlineSubscriptionActions: () => ({
    checkingSubscriptions: ref(false),
    checkingChannelId: ref(null),
    followChannel: vi.fn(),
    followChannelWithSetup: vi.fn(),
    unfollowChannel: vi.fn(),
    setAutoDownload: vi.fn(),
    setDownloadPrefs: vi.fn(),
    checkSubscriptionsNow: vi.fn(),
    checkChannelNow: vi.fn()
  })
}));
vi.mock('../online/streams', () => ({
  createOnlineStreams: () => ({
    queueSavedTrack: vi.fn(),
    playAllStreams: h.playAllStreams
  })
}));
vi.mock('../online/saved', () => ({
  createOnlineSaved: () => ({
    syncingSavedPlaylistState: ref(false),
    syncSavedPlaylist: vi.fn(),
    playSavedPlaylist: vi.fn()
  })
}));

import { useOnlineStore } from '../online';

let downloadHandler: ((task: unknown) => void) | null = null;
let subscriptionHandler: ((sub: unknown) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  h.player.streamPending = null;
  h.player.currentTrack = null;
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ success: true, url: 'https://stream/audio' });
  h.on.mockReset();
  h.on.mockImplementation((channel: string, handler: (payload: unknown) => void) => {
    if (channel === 'yt:downloadProgress') downloadHandler = handler;
    if (channel === 'yt:subs:updated') subscriptionHandler = handler;
  });
  downloadHandler = null;
  subscriptionHandler = null;
  (window as unknown as { api?: unknown }).api = { invoke: h.invoke, on: h.on };
  setActivePinia(createPinia());
});

function store() {
  return useOnlineStore();
}

describe('store bootstrap', () => {
  it('subscribes to download and subscription updates once', () => {
    const online = store();

    expect(h.on).toHaveBeenCalledWith('yt:downloadProgress', expect.any(Function));
    expect(h.on).toHaveBeenCalledWith('yt:subs:updated', expect.any(Function));
    expect(h.loadDownloads).toHaveBeenCalledTimes(1);
    expect(h.loadSubscriptions).toHaveBeenCalledTimes(1);

    online.subscribeDownloads();
    online.subscribeSubscriptionUpdates();
    expect(h.on).toHaveBeenCalledTimes(2);
  });

  it('stores download progress tasks', () => {
    store();

    downloadHandler!({ id: 'task-1', name: 'Video' });
    expect(h.upsertTask).toHaveBeenCalledWith({ converted: { id: 'task-1', name: 'Video' } });

    downloadHandler!({ name: 'no id' });
    downloadHandler!(null);
    expect(h.upsertTask).toHaveBeenCalledTimes(1);
  });

  it('adds subscriptions pushed by main', () => {
    store();

    subscriptionHandler!({ channelId: 'channel-1', name: 'Creator' });
    expect(h.addSubscription).toHaveBeenCalledWith({ channelId: 'channel-1', name: 'Creator' });

    subscriptionHandler!({ name: 'missing id' });
    subscriptionHandler!(null);
    expect(h.addSubscription).toHaveBeenCalledTimes(1);
  });
});

describe('openChannelPrefix', () => {
  it('opens the channel URL for the prefix', async () => {
    const online = store();

    await online.openChannelPrefix({ platform: 'youtube', name: 'creator' });

    expect(h.channelUrl).toHaveBeenCalledWith({ platform: 'youtube', name: 'creator' });
    expect(h.openChannel).toHaveBeenCalledWith('url:creator');
  });
});

describe('playStream', () => {
  const video = { id: 'abc', title: 'Song' };

  it('promotes the resolved stream to the current track', async () => {
    const online = store();

    await online.playStream(video as never);

    expect(h.streamTarget).toHaveBeenCalledWith(video);
    expect(h.streamChannel).toHaveBeenCalledWith('yt:abc');
    expect(h.invoke).toHaveBeenCalledWith('stream:yt:abc', 'yt:abc');
    expect(h.buildTrack).toHaveBeenLastCalledWith(video, 'https://stream/audio', 0);
    expect(h.player.setTrack).toHaveBeenCalledWith({
      id: 'track:abc',
      path: 'https://stream/audio',
      start: 0
    });
    expect(h.player.enrichTrack).toHaveBeenCalledTimes(2);
    expect(h.player.streamPending).toBeNull();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('reports stream failures through the global toast', async () => {
    const online = store();
    h.invoke.mockResolvedValueOnce({ success: false, code: 'bot' });

    await online.playStream(video as never);

    expect(h.player.setTrack).not.toHaveBeenCalled();
    expect(h.streamError).toHaveBeenCalledWith(h.t, 'bot');
    expect(h.notify).toHaveBeenCalledWith('error', 'Song', 'error:bot');
    expect(h.player.streamPending).toBeNull();
  });

  it('falls back to a network error when the invoke rejects', async () => {
    const online = store();
    h.invoke.mockRejectedValueOnce(new Error('offline'));

    await online.playStream(video as never);

    expect(h.streamError).toHaveBeenCalledWith(h.t, 'network');
    expect(h.notify).toHaveBeenCalledWith('error', 'Song', 'error:network');
  });

  it('drops a late result when the user selected something else', async () => {
    const online = store();
    h.invoke.mockImplementationOnce(async () => {
      h.player.streamPending = null;
      return { success: true, url: 'https://late' };
    });

    await online.playStream(video as never);

    expect(h.player.setTrack).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('drops a result superseded by another pending stream', async () => {
    const online = store();
    h.invoke.mockImplementationOnce(async () => {
      h.player.streamPending = { id: 'track:other' };
      return { success: true, url: 'https://late' };
    });

    await online.playStream(video as never);

    expect(h.player.setTrack).not.toHaveBeenCalled();
  });

  it('works without a bridge and reports a network error', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const online = store();

    await online.playStream(video as never);

    expect(h.notify).toHaveBeenCalledWith('error', 'Song', 'error:network');
  });
});
