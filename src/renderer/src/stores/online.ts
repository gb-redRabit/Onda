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
import { detectPlatform } from '@shared/platform';
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
import {
  normalizeResolvedTotal,
  mergeResolvedPage,
  type ResolveMoreResponse
} from '@renderer/utils/onlineResolved';
import { createStreamPrefetcher } from '@renderer/utils/streamPrefetch';
import { RESOLVED_AUTO_CAP, resolveAllPlaylistItems } from '@renderer/utils/onlineResolveAll';
import { buildChannelJobs } from '@renderer/utils/onlineChannelJobs';
import { createOnlineChannel } from './online/channel';
import { createOnlineSubscriptions } from './online/subscriptions';
import { createOnlineDownloads } from './online/downloads';

export const useOnlineStore = defineStore('online', () => {
  const { t } = useI18n();
  const searchResults = ref<YouTubeVideo[]>([]);
  const searchQuery = ref('');
  const isSearching = ref(false);
  const nextToken = ref<string | null>(null);
  const prevToken = ref<string | null>(null);
  const currentVideo = ref<YouTubeVideo | null>(null);
  const {
    subscriptions,
    subscriptionsLoaded,
    addSubscription,
    removeSubscription,
    isSubscribed,
    getSubscription,
    isVideoDownloaded,
    markVideoDownloaded,
    loadSubscriptions
  } = createOnlineSubscriptions();
  const checkingSubscriptions = ref(false);
  const checkingChannelId = ref<string | null>(null);
  const queuingId = ref<string | null>(null);
  const queueingChannelId = ref<string | null>(null);
  const { downloads, downloadByVideoId, upsertTask, submitJobs } =
    createOnlineDownloads(markVideoDownloaded);
  const resolved = ref<YouTubeResolveResult | null>(null);
  const isResolving = ref(false);
  const resolvedLoading = ref(false);
  const resolvedCapped = ref(false);
  const selectedResolved = ref<Set<string>>(new Set());
  let resolveLoadId = 0;

  const {
    channel,
    channelTab,
    channelHasShorts,
    channelViewMode,
    channelLoading,
    channelError,
    channelErrorCode,
    channelVideos,
    channelShorts,
    channelIsSc,
    channelItems,
    channelHasMore,
    openChannel,
    switchChannelTab,
    loadMoreChannel,
    setChannelViewMode,
    closeChannel
  } = createOnlineChannel();

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
    result = normalizeResolvedTotal(result);
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
    })) as ResolveMoreResponse;
    if (!res || !res.success || !res.items || res.items.length === 0) return false;
    const { resolved: merged, fresh } = mergeResolvedPage(r, res);
    resolved.value = merged;
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

  // Resolves the stream URL ahead of the click (card visibility) so playback
  // starts instantly: the main process LRU cache then serves the click without
  // waiting on the resolver. Best-effort — real errors surface through playStream.
  const { prefetch: prefetchStream } = createStreamPrefetcher();

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
        jobs.push(
          ...buildChannelJobs(
            res.items,
            channelId,
            channel.value?.title,
            prefs,
            existingIds,
            downloadedIds
          )
        );
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
