import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import { usePlayerStore } from '@renderer/stores/player';
import { useSavedStore } from '@renderer/stores/saved';
import type { MediaFile } from '@renderer/types/media';
import type {
  YouTubeVideo,
  YouTubeResolveResult,
  YouTubeResolvedItem,
  YouTubeChannel,
  Subscription,
  SubscriptionDownloadPrefs,
  DownloadTask,
  CoverStatus,
  MetaOverride
} from '@renderer/types/online';
import type {
  IpcDownloadJobInput,
  IpcDownloadTask,
  IpcSavedPlaylist,
  IpcStreamResult,
  IpcSubscription
} from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { pluginHookBus } from '@renderer/utils/pluginHooks';
import { detectPlatform } from '@shared/platform';
import { toMediaStreamUrl } from '@renderer/utils/mediaUrl';
import {
  streamTargetFor,
  streamChannelFor,
  streamErrorMessage,
  buildStreamTrack,
  resolvedToSavedStream,
  savedStreamToItem
} from '@renderer/utils/onlineHelpers';
import { buildJob, buildTaskInput, type JobExtra } from '@renderer/utils/onlineJob';
import { toDownloadTask } from '@renderer/utils/onlineDownloadTask';
import { channelUrlForPrefix } from '@renderer/utils/onlineChannel';

export const useOnlineStore = defineStore('online', () => {
  const { t } = useI18n();
  const searchResults = ref<YouTubeVideo[]>([]);
  const searchQuery = ref('');
  const isSearching = ref(false);
  const nextToken = ref<string | null>(null);
  const prevToken = ref<string | null>(null);
  const currentVideo = ref<YouTubeVideo | null>(null);
  const subscriptions = ref<Subscription[]>([]);
  const subscriptionsLoaded = ref(false);
  const checkingSubscriptions = ref(false);
  const checkingChannelId = ref<string | null>(null);
  const queuingId = ref<string | null>(null);
  const queueingChannelId = ref<string | null>(null);
  const downloads = ref<DownloadTask[]>([]);
  // O(1) lookup by videoId — updated in upsertTask, avoids O(n) find per item per render.
  const downloadByVideoId = new Map<string, DownloadTask>();
  const resolved = ref<YouTubeResolveResult | null>(null);
  const isResolving = ref(false);
  const resolvedLoading = ref(false);
  const resolvedCapped = ref(false);
  const selectedResolved = ref<Set<string>>(new Set());
  let resolveLoadId = 0;

  // Never auto-load more than this many playlist items into memory — large
  // playlists load on demand via the "load more" button instead.
  const RESOLVED_AUTO_CAP = 500;

  const channel = ref<YouTubeChannel | null>(null);
  const channelInput = ref('');
  const channelTab = ref<'videos' | 'shorts'>('videos');
  const channelHasShorts = ref(true);
  const channelViewMode = ref<'grid' | 'list'>('grid');
  const channelLoading = ref(false);
  const channelError = ref('');
  const channelErrorCode = ref('');
  const channelVideos = ref<YouTubeVideo[]>([]);
  const channelVideosHasMore = ref(false);
  const channelVideosOffset = ref(0);
  const channelVideosLoaded = ref(false);
  const channelShorts = ref<YouTubeVideo[]>([]);
  const channelShortsHasMore = ref(false);
  const channelShortsOffset = ref(0);
  const channelShortsLoaded = ref(false);
  // True while browsing a SoundCloud profile — switches the IPC channel and
  // disables the shorts tab / subscribe UI for it.
  const channelIsSc = ref(false);
  let channelKey = 0;

  const channelItems = computed(() =>
    channelTab.value === 'shorts' ? channelShorts.value : channelVideos.value
  );
  const channelHasMore = computed(() =>
    channelTab.value === 'shorts' ? channelShortsHasMore.value : channelVideosHasMore.value
  );

  const SEARCH_PAGE_SIZE = 20;
  const searchPage = ref(0);

  // Opens the channel/profile view for an @/$ prefixed query.
  async function openChannelPrefix(prefix: { platform: 'youtube' | 'soundcloud'; name: string }) {
    await openChannel(channelUrlForPrefix(prefix));
  }

  const searchScOffset = ref(0);
  const hasMoreSc = ref(false);
  const searchLoadingMore = ref(false);

  // Unified search across platforms: a plain phrase runs on BOTH YouTube and
  // SoundCloud in parallel (YT results first, SC appended). Links and @/$
  // channel prefixes are handled elsewhere (resolveOnline / openChannel).
  async function searchOnline(query: string): Promise<{
    success?: boolean;
    error?: string;
    code?: string;
    items: YouTubeVideo[];
    nextPageToken?: string | null;
    prevPageToken?: string | null;
  }> {
    const [ytRes, scRes] = await Promise.allSettled([
      window.api.invoke('yt:search', query) as Promise<{
        success?: boolean;
        error?: string;
        code?: string;
        items?: YouTubeVideo[];
      }>,
      window.api.invoke('sc:search', query) as Promise<{
        success?: boolean;
        error?: string;
        code?: string;
        items?: YouTubeVideo[];
      }>
    ]);
    const ytItems =
      ytRes.status === 'fulfilled' && ytRes.value?.success ? ytRes.value.items || [] : [];
    const scItems =
      scRes.status === 'fulfilled' && scRes.value?.success ? scRes.value.items || [] : [];
    const anySuccess =
      (ytRes.status === 'fulfilled' && !!ytRes.value?.success) ||
      (scRes.status === 'fulfilled' && !!scRes.value?.success);
    if (anySuccess) {
      // Track SC pagination: a full page means deeper offsets exist.
      searchScOffset.value = scItems.length;
      hasMoreSc.value = scItems.length >= 100;
      return { success: true, items: [...ytItems, ...scItems] };
    }
    const ytError = ytRes.status === 'fulfilled' ? ytRes.value : undefined;
    return {
      success: false,
      error: ytError?.error || 'Search failed',
      code: ytError?.code,
      items: []
    };
  }

  // Appends the next SoundCloud result page (YT caps at its first batch).
  async function loadMoreSearch(): Promise<void> {
    const q = searchQuery.value.trim();
    if (!q || searchLoadingMore.value || !hasMoreSc.value) return;
    searchLoadingMore.value = true;
    try {
      const res = (await window.api.invoke('sc:search', q, searchScOffset.value)) as {
        success?: boolean;
        items?: YouTubeVideo[];
      } | null;
      if (res?.success && res.items?.length) {
        const seen = new Set(searchResults.value.map((i) => i.id));
        searchResults.value = [...searchResults.value, ...res.items.filter((i) => !seen.has(i.id))];
        searchScOffset.value += res.items.length;
        hasMoreSc.value = res.items.length >= 100;
      } else {
        hasMoreSc.value = false;
      }
    } catch {
      hasMoreSc.value = false;
    } finally {
      searchLoadingMore.value = false;
    }
  }

  // Platform-dispatched link resolution (detects the platform from the link
  // itself, not from the active UI tab).
  async function resolveOnline(url: string): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    result?: YouTubeResolveResult;
  }> {
    const detected = detectPlatform(url);
    if (!detected) return { success: false, error: 'Unsupported or invalid link' };
    if (detected.platform === 'soundcloud') {
      return (await window.api.invoke('sc:resolve', url)) as {
        success: boolean;
        error?: string;
        code?: string;
        result?: YouTubeResolveResult;
      };
    }
    return (await window.api.invoke('yt:resolve', url)) as {
      success: boolean;
      error?: string;
      code?: string;
      result?: YouTubeResolveResult;
    };
  }

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
    resolvedCapped.value = false;
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

  // Loads one more page (30 items) of a resolved playlist. Shared by the
  // automatic loader and the manual "load more" button.
  async function loadResolvedPage(): Promise<boolean> {
    const r = resolved.value;
    if (!r || r.kind !== 'playlist' || !r.meta.hasMore) return false;
    // Platform dispatch — SC sets paginate via sc:resolveMore.
    const moreChannel =
      detectPlatform(r.sourceUrl)?.platform === 'soundcloud' ? 'sc:resolveMore' : 'yt:resolveMore';
    const nextStart = r.items.length + 1;
    const res = (await window.api.invoke(moreChannel, {
      url: r.sourceUrl,
      start: nextStart,
      end: nextStart + 29
    })) as {
      success?: boolean;
      items?: YouTubeResolvedItem[];
      hasMore?: boolean;
      totalItems?: number | null;
    };
    if (!res || !res.success || !res.items || res.items.length === 0) return false;
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
    return !!res.hasMore;
  }

  async function autoLoadResolved() {
    const loadId = resolveLoadId;
    resolvedLoading.value = true;
    try {
      while (resolved.value && resolved.value.kind === 'playlist' && resolved.value.meta.hasMore) {
        if (loadId !== resolveLoadId) return;
        if (resolved.value.items.length >= RESOLVED_AUTO_CAP) {
          resolvedCapped.value = true;
          break;
        }
        const hasMore = await loadResolvedPage();
        if (loadId !== resolveLoadId) return;
        if (!hasMore) break;
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

  async function loadMoreResolved() {
    if (resolvedLoading.value) return;
    resolvedLoading.value = true;
    try {
      const hasMore = await loadResolvedPage();
      resolvedCapped.value = hasMore;
    } finally {
      resolvedLoading.value = false;
    }
  }

  function upsertTask(task: DownloadTask) {
    const idx = downloads.value.findIndex((d) => d.id === task.id);
    const prev = idx >= 0 ? downloads.value[idx] : undefined;
    const becameCompleted = task.status === 'completed' && prev?.status !== 'completed';
    const becameError = task.status === 'error' && (!prev || prev.status !== 'error');
    const becameDownloading = task.status === 'downloading' && prev?.status !== 'downloading';
    if (idx >= 0) downloads.value[idx] = task;
    else downloads.value.push(task);
    if (task.videoId) downloadByVideoId.set(task.videoId, task);
    if (becameCompleted && task.videoId && task.channelId) {
      markVideoDownloaded(task.videoId, task.channelId);
    }
    if (becameError && task.error) {
      try {
        useUIStore().notify('error', task.title, task.error);
      } catch {
        // ui store unavailable
      }
    }
    try {
      if (becameDownloading) {
        pluginHookBus.emit('download:start', {
          id: task.id,
          url: task.url,
          title: task.title,
          platform: task.source ? String(task.source) : undefined,
          format: task.format,
          quality: task.quality
        });
      }
      if (becameCompleted) {
        pluginHookBus.emit('download:complete', {
          id: task.id,
          title: task.title,
          url: task.url,
          outputPath: task.outputPath
        });
      }
      if (becameError) {
        pluginHookBus.emit('download:error', {
          id: task.id,
          title: task.title,
          url: task.url,
          error: task.error,
          errorCode: task.errorCode
        });
      }
    } catch {
      // plugins unavailable
    }
  }

  async function submitJobs(inputs: IpcDownloadJobInput[]): Promise<number> {
    if (!inputs.length) return 0;
    try {
      const created = (await window.api.invoke('yt:download:add', inputs)) as IpcDownloadTask[];
      for (const task of created || []) upsertTask(toDownloadTask(task));
      return created?.length || 0;
    } catch {
      return 0;
    }
  }

  async function queueFromResolved(
    ids: string[],
    prefs?: SubscriptionDownloadPrefs,
    extra?: JobExtra
  ) {
    const result = resolved.value;
    if (!result || ids.length === 0) return;
    const byId = new Map(result.items.map((i) => [i.id, i]));
    const playlistTitle = result.kind === 'playlist' ? result.title : undefined;
    const channelTitle = result.meta.channelTitle;
    const jobs: IpcDownloadJobInput[] = ids
      .map((id) => byId.get(id))
      .filter((item): item is YouTubeResolvedItem => !!item)
      .map((item) =>
        buildJob(item, prefs, {
          ...extra,
          playlistTitle: extra?.playlistTitle || playlistTitle,
          channelTitle: extra?.channelTitle || channelTitle || item.channelTitle
        })
      );
    await submitJobs(jobs);
  }

  async function queueVideo(
    video: YouTubeVideo | YouTubeResolvedItem,
    prefs?: SubscriptionDownloadPrefs,
    extra?: JobExtra
  ) {
    const job = buildJob(video, prefs, extra);
    // Channel listings come from a flat playlist without channel_id per entry,
    // so stamp the job with the channel currently being browsed.
    if (!job.channelId && channel.value?.id) job.channelId = channel.value.id;
    if (!job.channelTitle && channel.value?.title) job.channelTitle = channel.value.title;
    queuingId.value = video.id;
    try {
      await submitJobs([job]);
    } finally {
      queuingId.value = null;
    }
  }

  // Plays a video online: resolves the direct stream URL (cached in main) and
  // sets it as an unpersisted 'stream' track. Failures (HLS, auth, bot-block)
  // surface as a notification instead of failing silently.
  async function playStream(video: YouTubeVideo | YouTubeResolvedItem) {
    const player = usePlayerStore();
    const url = streamTargetFor(video);
    // Optimistic UI: the player bar (and its thumbnail) appears instantly, while
    // the URL resolves in the background. streamPending is display-only — it is
    // never fed to the audio engine. The placeholder path is a non-empty key the
    // cover cache can seed (MediaCover ignores empty paths).
    const pending = buildStreamTrack(video, `${url}`, 0);
    player.streamPending = pending;
    player.enrichTrack(pending);
    const t0 = performance.now();
    logger.info('yt', `playStream start url=${url}`);
    let result;
    try {
      result = (await window.api?.invoke(streamChannelFor(url), url)) as
        IpcStreamResult | undefined;
    } catch (e) {
      logger.warn('yt', 'playStream invoke rejected', String(e));
      result = undefined;
    }
    logger.info('yt', `playStream resolve ms=${Math.round(performance.now() - t0)}`, result);
    // A newer intent may have replaced this pending track. A click for the SAME
    // video (e.g. playAllStreams claiming the same first item) must not cancel
    // the resolved URL — only a different video takes over.
    const superseding = player.streamPending;
    if (superseding && superseding.id !== pending.id) {
      logger.warn(
        'yt',
        'playStream pending superseded — dropping resolved URL',
        `clicked=${pending.id} pending=${superseding.id}`
      );
      return;
    }
    if (!result?.success || !result.url) {
      player.streamPending = null;
      useUIStore().notify('error', video.title, streamErrorMessage(t, result?.code ?? 'network'));
      return;
    }
    player.streamPending = null;
    const track = buildStreamTrack(video, result.url, 0);
    logger.info('yt', 'playStream promoting to currentTrack', track.id);
    player.setTrack(track);
    logger.info('yt', 'playStream track set', player.currentTrack?.type, player.currentTrack?.id);
    player.enrichTrack(track);
  }

  const prefetchedStreams = new Set<string>();
  let prefetchInFlight = 0;
  // High enough to cover a grid row + one click ahead; low enough to not hammer
  // YouTube with parallel yt-dlp spawns (they amplify transient 403 windows).
  const PREFETCH_MAX_IN_FLIGHT = 5;

  // Resolves the stream URL ahead of the click (card visibility) so playback
  // starts instantly: the main process LRU cache then serves the click without
  // waiting on the resolver. Best-effort — real errors surface through playStream.
  async function prefetchStream(video: { id: string; url?: string }): Promise<void> {
    if (prefetchedStreams.has(video.id) || prefetchInFlight >= PREFETCH_MAX_IN_FLIGHT) return;
    if (prefetchedStreams.size > 1000) prefetchedStreams.clear();
    prefetchedStreams.add(video.id);
    prefetchInFlight++;
    const url = streamTargetFor(video);
    try {
      const res = (await window.api?.invoke(streamChannelFor(url), url)) as
        IpcStreamResult | undefined;
      if (res?.success && res.url) {
        // Warm the CDN connection right away through the media-server
        // proxy (it retries transient 403s with backoff). By the time the user
        // clicks, the URL has already passed its rate-limit window, so the click
        // loads in a single attempt instead of paying 403s + retry delays.
        try {
          await fetch(toMediaStreamUrl(res.url), { headers: { Range: 'bytes=0-1' } });
        } catch {
          // best-effort probe — playback does not depend on it
        }
      }
    } catch {
      // ignore: prefetch is best-effort
    } finally {
      prefetchInFlight--;
    }
  }

  // Streams every item of a playlist/channel: resolves URLs in the background
  // (the main process caches them, so a repeated play-through is fast), plays the
  // first resolved item immediately and queues the rest in their original order.
  // Queues a single saved track (platform-dispatched via the stored page URL).
  async function queueSavedTrack(video: {
    id: string;
    title: string;
    duration?: string;
    thumbnail?: string;
    url?: string;
  }) {
    const player = usePlayerStore();
    const url = streamTargetFor(video);
    const result = (await window.api?.invoke(streamChannelFor(url), url)) as
      IpcStreamResult | undefined;
    if (!result?.success || !result.url) {
      useUIStore().notify('error', video.title, streamErrorMessage(t, result?.code ?? 'network'));
      return;
    }
    const track = buildStreamTrack(video, result.url, player.queueLength);
    player.enrichTrack(track);
    player.addToQueueMultiple([track]);
    useUIStore().notify('success', t('saved.addedToQueue'));
  }

  async function playAllStreams(items: YouTubeResolvedItem[]) {
    if (items.length === 0) return;
    const player = usePlayerStore();
    logger.info('yt', `playAllStreams start items=${items.length} first=${items[0]!.id}`);
    // The player bar appears instantly with the first item while it resolves.
    player.streamPending = buildStreamTrack(items[0]!, `yt:${items[0]!.id}`, 0);
    player.enrichTrack(player.streamPending);
    // Resolve with a small concurrency cap: parallel yt-dlp spawns hammer
    // YouTube and amplify the transient 403 rate-limit windows. The first item
    // plays immediately from its cached/prefetched URL; the rest can resolve in
    // the background while it plays.
    const ordered: (MediaFile | null)[] = items.map(() => null);
    let failures = 0;
    let started = false;
    const MAX_CONCURRENT = 4;
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        const item = items[idx]!;
        const url = streamTargetFor(item);
        let result: IpcStreamResult | undefined;
        try {
          result = (await window.api?.invoke(streamChannelFor(url), url)) as
            IpcStreamResult | undefined;
        } catch {
          result = undefined;
        }
        if (!result?.success || !result.url) {
          failures++;
          continue;
        }
        const track = buildStreamTrack(item, result.url, idx);
        ordered[idx] = track;
        if (!started) {
          started = true;
          // If the user clicked a specific video while play-all was resolving,
          // respect the click: its pending stays, the first item goes to the
          // queue and everything follows in order. Same-video clicks already
          // promote through playStream — do not replay a current track.
          const current = player.currentTrack;
          if (current && current.id === track.id) {
            if (player.streamPending?.id === track.id) player.streamPending = null;
          } else if (player.streamPending && player.streamPending.id !== track.id) {
            // fall through: queue items[0] too, in original order
          } else {
            player.streamPending = null;
            player.setTrack(track);
            player.enrichTrack(track);
          }
        }
        // Rebuild the queue in the original order, dropping tracks that already
        // played (history) or are currently playing.
        const consumed = new Set(player.history.map((h) => h.path));
        const current = player.currentTrack;
        const queued = ordered
          .map((t, i) => ({ t, i }))
          .filter(
            ({ t }) => t !== null && (!current || t.id !== current.id) && !consumed.has(t.path)
          )
          .sort((a, b) => a.i - b.i)
          .map(({ t }) => t!);
        player.clearQueue();
        player.addToQueueMultiple(queued);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, () => worker())
    );
    if (failures > 0) {
      useUIStore().notify(
        'warning',
        t('youtube.playAll'),
        t('youtube.playAllFailures', { count: failures })
      );
    }
    if (!started) {
      player.streamPending = null;
    }
  }

  // Loads every item of the currently relevant playlist (platform-dispatched:
  // YT playlists via yt:resolve, SoundCloud sets via sc:resolve).
  async function resolveAllPlaylistItems(
    url: string,
    cap = RESOLVED_AUTO_CAP
  ): Promise<{ items: YouTubeResolvedItem[]; totalItems: number | null }> {
    const isSc = detectPlatform(url)?.platform === 'soundcloud';
    const resolveChannel = isSc ? 'sc:resolve' : 'yt:resolve';
    const moreChannel = isSc ? 'sc:resolveMore' : 'yt:resolveMore';
    const items: YouTubeResolvedItem[] = [];
    let totalItems: number | null = null;
    let hasMore = false;
    const first = (await window.api?.invoke(resolveChannel, url)) as
      | {
          success?: boolean;
          result?: {
            items: YouTubeResolvedItem[];
            meta: { hasMore?: boolean; totalItems?: number | null };
          };
        }
      | undefined;
    if (!first?.success || !first.result) return { items, totalItems };
    items.push(...first.result.items);
    totalItems = first.result.meta.totalItems ?? null;
    hasMore = !!first.result.meta.hasMore;
    while (hasMore && items.length < cap) {
      const end = Math.min(items.length + 200, cap);
      const res = (await window.api?.invoke(moreChannel, {
        url,
        start: items.length + 1,
        end
      })) as
        | {
            success?: boolean;
            items?: YouTubeResolvedItem[];
            hasMore?: boolean;
            totalItems?: number | null;
          }
        | undefined;
      if (!res?.success || !res.items || res.items.length === 0) break;
      const seen = new Set(items.map((i) => i.id));
      items.push(...res.items.filter((i) => !seen.has(i.id)));
      if (res.totalItems != null) totalItems = res.totalItems;
      hasMore = !!res.hasMore && items.length < cap;
    }
    return { items, totalItems };
  }

  const syncingSavedPlaylists = new Set<string>();
  const syncingSavedPlaylistState = ref(new Set<string>());

  // Re-checks a saved playlist against YouTube in the background: new items are
  // appended at the end, removed ones are dropped, and the stored snapshot is
  // updated. Never blocks playback — results only surface through a toast.
  async function syncSavedPlaylist(p: IpcSavedPlaylist): Promise<{
    added: number;
    removed: number;
    total: number;
  } | null> {
    if (syncingSavedPlaylists.has(p.id)) return null;
    syncingSavedPlaylists.add(p.id);
    syncingSavedPlaylistState.value = new Set(syncingSavedPlaylists);
    try {
      const fresh = await resolveAllPlaylistItems(p.url);
      const stored = p.items ?? [];
      const freshIds = new Set(fresh.items.map((i) => i.id));
      const kept = stored.filter((s) => freshIds.has(s.id));
      const removed = stored.length - kept.length;
      const added = fresh.items.filter((i) => !stored.some((s) => s.id === i.id));
      const updated = [...kept, ...added.map(resolvedToSavedStream)];
      if (removed > 0 || added.length > 0) {
        const saved = useSavedStore();
        await saved.updatePlaylistItems(p.id, updated, fresh.totalItems);
      }
      if (removed > 0 || added.length > 0) {
        useUIStore().notify(
          'info',
          p.title,
          t('saved.syncChanged', { added: added.length, removed })
        );
      }
      return { added: added.length, removed, total: updated.length };
    } catch {
      return null;
    } finally {
      syncingSavedPlaylists.delete(p.id);
      syncingSavedPlaylistState.value = new Set(syncingSavedPlaylists);
    }
  }

  // Plays a saved playlist instantly from its stored snapshot (no network wait)
  // and re-checks the source in the background. Entries saved before the item
  // snapshot existed fall back to a full resolve first.
  async function playSavedPlaylist(p: IpcSavedPlaylist) {
    let items = p.items ?? [];
    if (items.length === 0) {
      const fresh = await resolveAllPlaylistItems(p.url);
      items = fresh.items.map(resolvedToSavedStream);
      if (items.length > 0) {
        const saved = useSavedStore();
        await saved.updatePlaylistItems(p.id, items, fresh.totalItems);
      }
    }
    if (items.length === 0) {
      useUIStore().notify('error', p.title, t('saved.playlistEmpty'));
      return;
    }
    void playAllStreams(items.map(savedStreamToItem));
    void syncSavedPlaylist(p);
  }

  // Loads every page of the currently relevant playlist (used when the user
  // saves it) so the snapshot contains the full list, not just the first page.
  async function loadAllResolvedItems(url: string) {
    return resolveAllPlaylistItems(url);
  }

  // Status of the download task for a given video id (used to show a loading /
  // downloading / done state on the quick "download" button).
  function downloadStatusFor(videoId: string): DownloadTask['status'] | null {
    if (!videoId) return null;
    const task = downloadByVideoId.get(videoId);
    return task ? task.status : null;
  }

  // Cover-processing status of the task for a video (used to show that the
  // animated cover is still being prepared after the audio download finished).
  function coverStatusFor(videoId: string): CoverStatus | null {
    if (!videoId) return null;
    const task = downloadByVideoId.get(videoId);
    return task?.coverStatus ?? null;
  }

  // Resolves and queues a batch of links (videos and playlist first-page
  // items; channels are skipped) across platforms. Returns how many downloads
  // were enqueued.
  async function queueBatch(urls: string[], extra?: JobExtra): Promise<number> {
    let queued = 0;
    for (const url of urls) {
      try {
        const res = await resolveOnline(url);
        if (!res?.success || !res.result) continue;
        if (res.result.kind === 'video') {
          const item = res.result.items[0];
          if (item) {
            await queueVideo(item, undefined, extra);
            queued++;
          }
        } else if (res.result.kind === 'playlist') {
          for (const item of res.result.items) {
            await queueVideo(item, undefined, extra);
            queued++;
          }
        }
      } catch {
        /* skip unresolvable entry */
      }
    }
    return queued;
  }

  async function recordQueuedVideos(channelId: string, videoIds: string[]) {
    const ids = videoIds.filter((id): id is string => !!id);
    if (!ids.length) return;
    const sub = getSubscription(channelId);
    const merged = Array.from(new Set([...(sub?.queuedVideoIds || []), ...ids]));
    if (sub) {
      addSubscription({ ...sub, queuedVideoIds: merged, pendingCount: merged.length });
    }
    try {
      const updated = (await window.api.invoke('yt:subs:update', channelId, {
        queuedVideoIds: merged,
        pendingCount: merged.length
      })) as Subscription | null;
      if (updated) addSubscription(updated);
    } catch {
      /* failed to record queued ids */
    }
  }

  async function queueChannelVideos(
    channelId: string,
    prefs?: SubscriptionDownloadPrefs,
    includeDownloaded = false
  ) {
    const subscription = getSubscription(channelId);
    const isSc = subscription?.platform === 'soundcloud';
    const downloadedIds = includeDownloaded
      ? new Set<string>()
      : new Set(subscription?.downloadedVideoIds || []);
    // Only active or finished jobs block a re-queue — a failed/cancelled attempt
    // must be re-queueable or "download all" silently skips it forever.
    const existingIds = new Set(
      downloads.value
        .filter((d) => d.status !== 'error' && d.status !== 'cancelled')
        .map((d) => d.videoId)
    );
    const jobs: IpcDownloadJobInput[] = [];
    queueingChannelId.value = channelId;
    try {
      const res = isSc
        ? ((await window.api.invoke('sc:channelAll', {
            url: `https://soundcloud.com/${channelId}`
          })) as { success?: boolean; items?: YouTubeVideo[] })
        : ((await window.api.invoke('yt:channelAll', {
            url: `https://www.youtube.com/channel/${channelId}`,
            tab: 'videos'
          })) as { success?: boolean; items?: YouTubeVideo[] });
      if (res?.success && res.items) {
        for (const item of res.items) {
          if (!item.id || existingIds.has(item.id) || downloadedIds.has(item.id)) continue;
          const job = buildJob(item, prefs);
          // Flat listings carry no channel_id per entry — always attribute to
          // the channel being downloaded so finished jobs are recorded correctly.
          if (!job.channelId) job.channelId = channelId;
          if (!job.channelTitle && channel.value?.title) job.channelTitle = channel.value.title;
          jobs.push(job);
          existingIds.add(item.id);
        }
      } else {
        useUIStore().notify('warning', t('youtube.downloadAll'), t('youtube.channelQueueFailed'));
      }
      if (res?.success && jobs.length === 0) {
        useUIStore().notify('info', t('youtube.downloadAll'), t('youtube.nothingToQueue'));
      }
      await submitJobs(jobs);
      await recordQueuedVideos(
        channelId,
        jobs.map((j) => j.videoId || '')
      );
    } finally {
      queueingChannelId.value = null;
    }
  }

  async function openChannel(input: string) {
    channelKey++;
    channel.value = null;
    channelInput.value = input;
    channelIsSc.value = detectPlatform(input)?.platform === 'soundcloud';
    channelTab.value = 'videos';
    channelHasShorts.value = !channelIsSc.value;
    channelError.value = '';
    channelErrorCode.value = '';
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
    if (channelIsSc.value) return;
    if (channelTab.value === tab) return;
    if (tab === 'shorts' && !channelHasShorts.value) return;
    channelTab.value = tab;
    const loaded = tab === 'shorts' ? channelShortsLoaded.value : channelVideosLoaded.value;
    if (!loaded) await loadChannelTab(tab);
  }

  async function loadChannelTab(tab: 'videos' | 'shorts') {
    const key = ++channelKey;
    channelError.value = '';
    channelErrorCode.value = '';
    channelLoading.value = true;
    try {
      const res = channelIsSc.value
        ? await window.api.invoke('sc:channel', { url: channelInput.value })
        : await window.api.invoke('yt:channel', { url: channelInput.value, tab });
      if (key !== channelKey) return;
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
        channelErrorCode.value = res?.code || '';
      }
    } catch {
      if (key === channelKey) channelError.value = 'Could not load this channel';
    } finally {
      if (key === channelKey) channelLoading.value = false;
    }
  }

  async function loadMoreChannel() {
    const tab = channelTab.value;
    const loaded = tab === 'shorts' ? channelShortsLoaded.value : channelVideosLoaded.value;
    if (!channel.value || channelLoading.value || !loaded) return;
    channelLoading.value = true;
    const key = channelKey;
    const offset = tab === 'shorts' ? channelShortsOffset.value : channelVideosOffset.value;
    try {
      const res = channelIsSc.value
        ? await window.api.invoke('sc:channel', {
            url: channelInput.value,
            start: offset + 1,
            end: offset + 30
          })
        : await window.api.invoke('yt:channel', {
            url: channelInput.value,
            tab,
            start: offset + 1,
            end: offset + 30
          });
      if (key !== channelKey) return;
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
    } catch {
      if (key === channelKey) channelError.value = 'Could not load this channel';
    } finally {
      if (key === channelKey) channelLoading.value = false;
    }
  }

  function setChannelViewMode(mode: 'grid' | 'list') {
    channelViewMode.value = mode;
  }

  function closeChannel() {
    channelKey++;
    channel.value = null;
    channelInput.value = '';
    channelIsSc.value = false;
    channelTab.value = 'videos';
    channelHasShorts.value = true;
    channelError.value = '';
    channelErrorCode.value = '';
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
    const idx = subscriptions.value.findIndex((s) => s.channelId === sub.channelId);
    if (idx >= 0) subscriptions.value[idx] = sub;
    else subscriptions.value.push(sub);
    subscriptionsLoaded.value = true;
  }

  function removeSubscription(channelId: string) {
    subscriptions.value = subscriptions.value.filter((s) => s.channelId !== channelId);
  }

  function isSubscribed(channelId: string): boolean {
    return subscriptions.value.some((s) => s.channelId === channelId);
  }

  function getSubscription(channelId: string): Subscription | undefined {
    return subscriptions.value.find((s) => s.channelId === channelId);
  }

  function isVideoDownloaded(videoId: string, channelId?: string): boolean {
    if (!channelId) return false;
    const sub = getSubscription(channelId);
    return !!sub && (sub.downloadedVideoIds || []).includes(videoId);
  }

  // Optimistic local update only. Persistence is handled in main by
  // setDownloadCompletedHandler (atomic append + yt:subs:updated broadcast),
  // so this never writes a stale full array over the file. pendingCount is
  // decremented here too so the „do pobrania" badge is live while downloading.
  function markVideoDownloaded(videoId: string, channelId: string) {
    const sub = getSubscription(channelId);
    if (!sub) return;
    const known = new Set(sub.downloadedVideoIds || []);
    const wasKnown = known.has(videoId);
    known.add(videoId);
    const queued = (sub.queuedVideoIds || []).filter((id) => id !== videoId);
    const pendingCount =
      sub.pendingCount != null && !wasKnown ? Math.max(0, sub.pendingCount - 1) : sub.pendingCount;
    addSubscription({
      ...sub,
      downloadedVideoIds: [...known],
      queuedVideoIds: queued,
      pendingCount
    });
  }

  async function loadSubscriptions() {
    try {
      const list = (await window.api.invoke('yt:subs:list')) as Subscription[] | null;
      if (list) subscriptions.value = list;
    } catch {
      /* subscriptions unavailable */
    }
    subscriptionsLoaded.value = true;
  }

  async function followChannel(channel: {
    channelId: string;
    channelTitle: string;
    channelThumbnail: string;
    platform?: 'youtube' | 'soundcloud';
  }) {
    try {
      const sub = (await window.api.invoke('yt:subs:add', channel)) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* failed to follow */
    }
  }

  async function followChannelWithSetup(
    channel: {
      channelId: string;
      channelTitle: string;
      channelThumbnail: string;
      platform?: 'youtube' | 'soundcloud';
    },
    setup: { prefs?: SubscriptionDownloadPrefs; downloadAll: boolean }
  ) {
    try {
      const input = {
        ...channel,
        platform:
          channel.platform === 'soundcloud' ? ('soundcloud' as const) : ('youtube' as const),
        downloadPrefs: setup.prefs,
        seedBaseline: !setup.downloadAll
      };
      const sub = (await window.api.invoke('yt:subs:add', input)) as Subscription | null;
      if (sub) addSubscription(sub);
      if (sub && setup.downloadAll) {
        await queueChannelVideos(sub.channelId, setup.prefs || sub.downloadPrefs, true);
      }
    } catch {
      /* failed to follow */
    }
  }

  async function unfollowChannel(channelId: string) {
    try {
      await window.api.invoke('yt:subs:remove', channelId);
      removeSubscription(channelId);
    } catch {
      /* failed to unfollow */
    }
  }

  async function setAutoDownload(channelId: string, enabled: boolean) {
    try {
      const sub = (await window.api.invoke('yt:subs:update', channelId, {
        autoDownload: enabled
      })) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* failed to update */
    }
  }

  async function setDownloadPrefs(channelId: string, prefs: SubscriptionDownloadPrefs) {
    try {
      const sub = (await window.api.invoke('yt:subs:update', channelId, {
        downloadPrefs: prefs
      })) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* failed to update prefs */
    }
  }

  async function checkSubscriptionsNow() {
    if (checkingSubscriptions.value) return;
    checkingSubscriptions.value = true;
    try {
      await window.api.invoke('yt:subs:checkNow');
      await loadSubscriptions();
    } catch {
      /* check failed */
    } finally {
      checkingSubscriptions.value = false;
    }
  }

  async function checkChannelNow(channelId: string) {
    if (checkingChannelId.value) return;
    checkingChannelId.value = channelId;
    try {
      await window.api.invoke('yt:subs:checkChannel', channelId);
      await loadSubscriptions();
    } catch {
      /* check failed */
    } finally {
      checkingChannelId.value = null;
    }
  }

  let subscribedToDownloads = false;

  function subscribeDownloads() {
    if (subscribedToDownloads) return;
    subscribedToDownloads = true;
    window.api?.on('yt:downloadProgress', (task) => {
      const t = task as IpcDownloadTask;
      if (t && typeof t.id === 'string') upsertTask(toDownloadTask(t));
    });
  }

  let subscribedToSubscriptionUpdates = false;

  function subscribeSubscriptionUpdates() {
    if (subscribedToSubscriptionUpdates) return;
    subscribedToSubscriptionUpdates = true;
    window.api?.on('yt:subs:updated', (updated) => {
      const sub = updated as IpcSubscription;
      if (sub && typeof sub.channelId === 'string') addSubscription(sub as Subscription);
    });
  }

  async function loadDownloads() {
    try {
      const list = (await window.api.invoke('yt:download:list')) as IpcDownloadTask[];
      if (Array.isArray(list)) {
        downloads.value = list.map(toDownloadTask);
        downloadByVideoId.clear();
        for (const d of downloads.value) {
          if (d.videoId) downloadByVideoId.set(d.videoId, d);
        }
      }
    } catch {
      /* downloads unavailable yet */
    }
  }

  async function addTask(task: DownloadTask) {
    await submitJobs([buildTaskInput(task)]);
  }

  async function cancelDownload(id: string) {
    try {
      const ok = (await window.api.invoke('yt:download:cancel', id)) as boolean;
      if (ok) {
        const idx = downloads.value.findIndex((d) => d.id === id);
        if (idx >= 0) {
          const prev = downloads.value[idx];
          downloads.value[idx] = { ...prev, status: 'cancelled' };
        }
      }
    } catch {
      /* cancel failed */
    }
  }

  async function pauseDownload(id: string) {
    try {
      const ok = (await window.api.invoke('yt:download:pause', id)) as boolean;
      if (ok) {
        const idx = downloads.value.findIndex((d) => d.id === id);
        if (idx >= 0) {
          const prev = downloads.value[idx];
          downloads.value[idx] = { ...prev, status: 'paused' };
        }
      }
    } catch {
      /* pause failed */
    }
  }

  async function resumeDownload(id: string) {
    try {
      const ok = (await window.api.invoke('yt:download:resume', id)) as boolean;
      if (ok) {
        const idx = downloads.value.findIndex((d) => d.id === id);
        if (idx >= 0) {
          const prev = downloads.value[idx];
          downloads.value[idx] = { ...prev, status: 'pending' };
        }
      }
    } catch {
      /* resume failed */
    }
  }

  async function retryDownload(task: DownloadTask) {
    const created = await submitJobs([buildTaskInput(task)]);
    if (!created) {
      // The main process replaced the failed job with a fresh one only when no
      // active job with the same video id existed. If it was skipped, tell the
      // user instead of failing silently.
      useUIStore().notify('info', t('downloads.retry'), t('youtube.retryAlreadyActive'));
      return;
    }
    // A retry creates a brand-new job — drop the old failed row so the same
    // video is not listed twice (once as error, once as pending).
    const idx = downloads.value.findIndex((d) => d.id === task.id);
    if (idx >= 0) downloads.value.splice(idx, 1);
    if (task.videoId && downloadByVideoId.get(task.videoId)?.id === task.id) {
      downloadByVideoId.delete(task.videoId);
    }
  }

  async function pauseAll() {
    try {
      await window.api.invoke('yt:download:pauseAll');
    } catch {
      /* pause all failed */
    }
  }

  async function resumeAll() {
    try {
      await window.api.invoke('yt:download:resumeAll');
    } catch {
      /* resume all failed */
    }
  }

  async function moveToFront(id: string) {
    try {
      await window.api.invoke('yt:download:moveToFront', id);
    } catch {
      /* move to front failed */
    }
  }

  async function move(id: string, direction: -1 | 1) {
    try {
      await window.api.invoke('yt:download:move', id, direction);
    } catch {
      /* move failed */
    }
  }

  async function exportQueue() {
    try {
      return (await window.api.invoke('yt:download:export')) as {
        success: boolean;
        error?: string;
      };
    } catch {
      return { success: false };
    }
  }

  async function importQueue() {
    try {
      const res = (await window.api.invoke('yt:download:import')) as {
        success: boolean;
        count?: number;
      };
      if (res?.success) await loadDownloads();
      return res ?? { success: false };
    } catch {
      return { success: false };
    }
  }

  async function scheduleStart(timestamp: number | null) {
    try {
      await window.api.invoke('yt:download:schedule', timestamp);
    } catch {
      /* schedule failed */
    }
  }

  async function getScheduledStart(): Promise<number | null> {
    try {
      return (await window.api.invoke('yt:download:schedule:get')) as number | null;
    } catch {
      return null;
    }
  }

  async function updateMetadata(filePath: string, meta: MetaOverride): Promise<boolean> {
    try {
      const res = (await window.api.invoke('yt:download:updateMetadata', filePath, meta)) as {
        success: boolean;
      };
      return !!res?.success;
    } catch {
      return false;
    }
  }

  async function clearFinishedDownloads() {
    try {
      await window.api.invoke('yt:download:clearFinished');
      downloads.value = downloads.value.filter(
        (d) => d.status === 'pending' || d.status === 'downloading' || d.status === 'paused'
      );
      downloadByVideoId.clear();
      for (const d of downloads.value) {
        if (d.videoId) downloadByVideoId.set(d.videoId, d);
      }
    } catch {
      /* clear failed */
    }
  }

  subscribeDownloads();
  subscribeSubscriptionUpdates();
  void loadDownloads();
  void loadSubscriptions();

  return {
    openChannelPrefix,
    searchOnline,
    loadMoreSearch,
    hasMoreSc,
    searchLoadingMore,
    resolveOnline,
    itemUrl: streamTargetFor,
    channelIsSc,
    searchResults,
    searchQuery,
    isSearching,
    nextToken,
    prevToken,
    currentVideo,
    subscriptions,
    subscriptionsLoaded,
    checkingSubscriptions,
    checkingChannelId,
    queuingId,
    queueingChannelId,
    downloadStatusFor,
    coverStatusFor,
    downloads,
    resolved,
    isResolving,
    resolvedLoading,
    resolvedCapped,
    loadMoreResolved,
    selectedResolved,
    channel,
    channelItems,
    channelLoading,
    channelHasMore,
    channelTab,
    channelHasShorts,
    channelViewMode,
    channelError,
    channelErrorCode,
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
    playStream,
    playAllStreams,
    queueSavedTrack,
    syncSavedPlaylist,
    playSavedPlaylist,
    loadAllResolvedItems,
    syncingSavedPlaylistState,
    prefetchStream,
    queueBatch,
    queueChannelVideos,
    openChannel,
    switchChannelTab,
    loadMoreChannel,
    setChannelViewMode,
    closeChannel,
    addSubscription,
    removeSubscription,
    isSubscribed,
    getSubscription,
    isVideoDownloaded,
    markVideoDownloaded,
    loadSubscriptions,
    followChannel,
    followChannelWithSetup,
    unfollowChannel,
    setAutoDownload,
    setDownloadPrefs,
    checkSubscriptionsNow,
    checkChannelNow,
    subscribeDownloads,
    subscribeSubscriptionUpdates,
    loadDownloads,
    addTask,
    retryDownload,
    cancelDownload,
    pauseDownload,
    resumeDownload,
    pauseAll,
    resumeAll,
    moveToFront,
    move,
    exportQueue,
    importQueue,
    scheduleStart,
    getScheduledStart,
    updateMetadata,
    clearFinishedDownloads,
    submitJobs
  };
});
