import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  YouTubeVideo,
  YouTubeResolveResult,
  YouTubeResolvedItem,
  YouTubeChannel,
  Subscription,
  DownloadTask
} from '@renderer/types/youtube';

export const useYouTubeStore = defineStore('youtube', () => {
  const searchResults = ref<YouTubeVideo[]>([]);
  const searchQuery = ref('');
  const isSearching = ref(false);
  const nextToken = ref<string | null>(null);
  const prevToken = ref<string | null>(null);
  const currentVideo = ref<YouTubeVideo | null>(null);
  const subscriptions = ref<Subscription[]>([]);
  const downloads = ref<DownloadTask[]>([]);
  const resolved = ref<YouTubeResolveResult | null>(null);
  const isResolving = ref(false);
  const resolvedLoading = ref(false);
  const selectedResolved = ref<Set<string>>(new Set());
  let resolveLoadId = 0;

  const channel = ref<YouTubeChannel | null>(null);
  const channelInput = ref('');
  const channelTab = ref<'videos' | 'shorts'>('videos');
  const channelHasShorts = ref(true);
  const channelViewMode = ref<'grid' | 'list'>('grid');
  const channelLoading = ref(false);
  const channelError = ref('');
  const channelVideos = ref<YouTubeVideo[]>([]);
  const channelVideosHasMore = ref(false);
  const channelVideosOffset = ref(0);
  const channelVideosLoaded = ref(false);
  const channelShorts = ref<YouTubeVideo[]>([]);
  const channelShortsHasMore = ref(false);
  const channelShortsOffset = ref(0);
  const channelShortsLoaded = ref(false);
  let channelKey = 0;

  const channelItems = computed(() =>
    channelTab.value === 'shorts' ? channelShorts.value : channelVideos.value
  );
  const channelHasMore = computed(() =>
    channelTab.value === 'shorts' ? channelShortsHasMore.value : channelVideosHasMore.value
  );

  const SEARCH_PAGE_SIZE = 20;
  const searchPage = ref(0);
  const pagedResults = computed(() => {
    const start = searchPage.value * SEARCH_PAGE_SIZE;
    return searchResults.value.slice(start, start + SEARCH_PAGE_SIZE);
  });
  const hasNextPage = computed(
    () => (searchPage.value + 1) * SEARCH_PAGE_SIZE < searchResults.value.length
  );
  const hasPrevPage = computed(() => searchPage.value > 0);

  function setResults(results: YouTubeVideo[], nextPage?: string, prevPage?: string) {
    searchResults.value = results;
    searchPage.value = 0;
    nextToken.value = nextPage || null;
    prevToken.value = prevPage || null;
  }

  function nextSearchPage() {
    if (hasNextPage.value) searchPage.value++;
  }

  function prevSearchPage() {
    if (hasPrevPage.value) searchPage.value--;
  }

  function setResolved(result: YouTubeResolveResult | null) {
    resolveLoadId++;
    // A playlist that fits on the first page and reports no count is already
    // fully loaded — the items length is its exact total.
    if (
      result &&
      result.kind === 'playlist' &&
      !result.meta.hasMore &&
      result.meta.totalItems == null
    ) {
      result = { ...result, meta: { ...result.meta, totalItems: result.items.length } };
    }
    resolved.value = result;
    resolvedLoading.value = false;
    selectedResolved.value = new Set(
      result ? result.items.filter((i) => i.isPlayable !== false).map((i) => i.id) : []
    );
    if (result && result.kind === 'playlist' && result.meta.hasMore) {
      void autoLoadResolved();
    }
  }

  async function autoLoadResolved() {
    const loadId = resolveLoadId;
    resolvedLoading.value = true;
    try {
      let nextStart = (resolved.value?.items.length ?? 0) + 1;
      while (resolved.value && resolved.value.kind === 'playlist' && resolved.value.meta.hasMore) {
        if (loadId !== resolveLoadId) return;
        const r = resolved.value;
        const res = await window.api.invoke('yt:resolveMore', {
          url: r.sourceUrl,
          start: nextStart,
          end: nextStart + 29
        });
        if (loadId !== resolveLoadId) return;
        if (!res || !res.success || res.items.length === 0) break;
        nextStart += res.items.length;
        const seen = new Set(r.items.map((i) => i.id));
        const fresh = res.items.filter((i) => !seen.has(i.id));
        resolved.value = {
          ...r,
          items: [...r.items, ...fresh],
          meta: {
            ...r.meta,
            hasMore: res.hasMore,
            totalItems: res.totalItems || r.meta.totalItems
          }
        };
        const sel = new Set(selectedResolved.value);
        for (const it of fresh) {
          if (it.isPlayable !== false) sel.add(it.id);
        }
        selectedResolved.value = sel;
        if (!res.hasMore) break;
      }
      // All items are loaded now, so the exact total is finally known.
      if (loadId === resolveLoadId && resolved.value && resolved.value.meta.totalItems == null) {
        const r = resolved.value;
        resolved.value = {
          ...r,
          meta: { ...r.meta, totalItems: r.items.length }
        };
      }
    } finally {
      if (loadId === resolveLoadId) resolvedLoading.value = false;
    }
  }

  function queueFromResolved(ids: string[]) {
    const result = resolved.value;
    if (!result || ids.length === 0) return;
    const byId = new Map(result.items.map((i) => [i.id, i]));
    const now = Date.now();
    const tasks: DownloadTask[] = ids
      .map((id) => byId.get(id))
      .filter((item): item is YouTubeResolvedItem => !!item)
      .map((item, idx) => ({
        id: `${item.id}-${now}-${idx}`,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        title: item.title,
        thumbnail: item.thumbnail,
        format: 'mp3',
        quality: 'best',
        outputPath: '',
        progress: 0,
        speed: '',
        eta: '',
        status: 'pending' as const,
        startedAt: now
      }));
    downloads.value.push(...tasks);
  }

  function queueVideo(video: YouTubeVideo) {
    downloads.value.push({
      id: `${video.id}-${Date.now()}`,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.title,
      thumbnail: video.thumbnail,
      format: 'mp3',
      quality: 'best',
      outputPath: '',
      progress: 0,
      speed: '',
      eta: '',
      status: 'pending',
      startedAt: Date.now()
    });
  }

  async function openChannel(input: string) {
    channelKey++;
    channel.value = null;
    channelInput.value = input;
    channelTab.value = 'videos';
    channelHasShorts.value = true;
    channelError.value = '';
    channelVideos.value = [];
    channelVideosHasMore.value = false;
    channelVideosOffset.value = 0;
    channelVideosLoaded.value = false;
    channelShorts.value = [];
    channelShortsHasMore.value = false;
    channelShortsOffset.value = 0;
    channelShortsLoaded.value = false;
    await loadChannelTab('videos');
  }

  async function switchChannelTab(tab: 'videos' | 'shorts') {
    if (channelTab.value === tab) return;
    if (tab === 'shorts' && !channelHasShorts.value) return;
    channelTab.value = tab;
    const loaded = tab === 'shorts' ? channelShortsLoaded.value : channelVideosLoaded.value;
    if (!loaded) await loadChannelTab(tab);
  }

  async function loadChannelTab(tab: 'videos' | 'shorts') {
    const key = ++channelKey;
    channelError.value = '';
    channelLoading.value = true;
    const res = await window.api.invoke('yt:channel', { url: channelInput.value, tab });
    if (key !== channelKey) return;
    channelLoading.value = false;
    if (res && res.success && res.channel) {
      channel.value = res.channel;
      if (tab === 'shorts') {
        channelShorts.value = res.items;
        channelShortsHasMore.value = res.hasMore;
        channelShortsOffset.value = res.items.length;
        channelShortsLoaded.value = true;
      } else {
        channelVideos.value = res.items;
        channelVideosHasMore.value = res.hasMore;
        channelVideosOffset.value = res.items.length;
        channelVideosLoaded.value = true;
      }
    } else if (res && res.error === 'no_shorts_tab') {
      channelHasShorts.value = false;
      if (tab === 'shorts') {
        channelTab.value = 'videos';
        if (!channelVideosLoaded.value) await loadChannelTab('videos');
      }
    } else {
      channelError.value = res?.error || 'Could not load this channel';
    }
  }

  async function loadMoreChannel() {
    const tab = channelTab.value;
    const loaded = tab === 'shorts' ? channelShortsLoaded.value : channelVideosLoaded.value;
    if (!channel.value || channelLoading.value || !loaded) return;
    channelLoading.value = true;
    const key = channelKey;
    const offset = tab === 'shorts' ? channelShortsOffset.value : channelVideosOffset.value;
    const res = await window.api.invoke('yt:channel', {
      url: channelInput.value,
      tab,
      start: offset + 1,
      end: offset + 30
    });
    if (key !== channelKey) return;
    channelLoading.value = false;
    if (res && res.success) {
      if (tab === 'shorts') {
        channelShorts.value.push(...res.items);
        channelShortsHasMore.value = res.hasMore;
        channelShortsOffset.value += res.items.length;
      } else {
        channelVideos.value.push(...res.items);
        channelVideosHasMore.value = res.hasMore;
        channelVideosOffset.value += res.items.length;
      }
    }
  }

  function setChannelViewMode(mode: 'grid' | 'list') {
    channelViewMode.value = mode;
  }

  function closeChannel() {
    channelKey++;
    channel.value = null;
    channelInput.value = '';
    channelTab.value = 'videos';
    channelHasShorts.value = true;
    channelError.value = '';
    channelVideos.value = [];
    channelVideosHasMore.value = false;
    channelVideosOffset.value = 0;
    channelVideosLoaded.value = false;
    channelShorts.value = [];
    channelShortsHasMore.value = false;
    channelShortsOffset.value = 0;
    channelShortsLoaded.value = false;
    channelLoading.value = false;
  }

  function addSubscription(sub: Subscription) {
    subscriptions.value.push(sub);
  }

  function removeSubscription(id: string) {
    subscriptions.value = subscriptions.value.filter((s) => s.id !== id);
  }

  function addDownload(task: DownloadTask) {
    downloads.value.push(task);
  }

  function updateDownload(id: string, update: Partial<DownloadTask>) {
    const idx = downloads.value.findIndex((d) => d.id === id);
    if (idx >= 0) Object.assign(downloads.value[idx], update);
  }

  function cancelDownload(id: string) {
    updateDownload(id, { status: 'cancelled' });
  }

  return {
    searchResults,
    searchQuery,
    isSearching,
    nextToken,
    prevToken,
    currentVideo,
    subscriptions,
    downloads,
    resolved,
    isResolving,
    resolvedLoading,
    selectedResolved,
    channel,
    channelItems,
    channelLoading,
    channelHasMore,
    channelTab,
    channelHasShorts,
    channelViewMode,
    channelError,
    channelVideos,
    channelShorts,
    pagedResults,
    searchPage,
    hasNextPage,
    hasPrevPage,
    setResults,
    nextSearchPage,
    prevSearchPage,
    setResolved,
    queueFromResolved,
    queueVideo,
    openChannel,
    switchChannelTab,
    loadMoreChannel,
    setChannelViewMode,
    closeChannel,
    addSubscription,
    removeSubscription,
    addDownload,
    updateDownload,
    cancelDownload
  };
});
