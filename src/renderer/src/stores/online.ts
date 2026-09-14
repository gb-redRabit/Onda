import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import { usePlayerStore } from '@renderer/stores/player';
import type { YouTubeVideo, YouTubeResolvedItem, Subscription } from '@renderer/types/online';
import type { IpcDownloadTask, IpcStreamResult, IpcSubscription } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import {
  streamTargetFor,
  streamChannelFor,
  streamErrorMessage,
  buildStreamTrack
} from '@renderer/utils/onlineHelpers';
import { toDownloadTask } from '@renderer/utils/onlineDownloadTask';
import { channelUrlForPrefix } from '@renderer/utils/onlineChannel';
import { createStreamPrefetcher } from '@renderer/utils/streamPrefetch';
import { createOnlineChannel } from './online/channel';
import { createOnlineSubscriptions } from './online/subscriptions';
import { createOnlineSubscriptionActions } from './online/subscriptionActions';
import { createOnlineQueue } from './online/queue';
import { createOnlineDownloads } from './online/downloads';
import { createOnlineSearch } from './online/search';
import { createOnlineSaved } from './online/saved';
import { createOnlineStreams } from './online/streams';
import { createOnlineResolved } from './online/resolved';

export const useOnlineStore = defineStore('online', () => {
  const { t } = useI18n();
  const {
    searchResults,
    searchQuery,
    isSearching,
    nextToken,
    prevToken,
    searchPage,
    hasMoreSc,
    searchLoadingMore,
    pagedResults,
    hasNextPage,
    hasPrevPage,
    searchOnline,
    loadMoreSearch,
    setResults,
    nextSearchPage,
    prevSearchPage
  } = createOnlineSearch();
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
  const {
    downloads,
    upsertTask,
    submitJobs,
    downloadStatusFor,
    coverStatusFor,
    loadDownloads,
    addTask,
    cancelDownload,
    pauseDownload,
    resumeDownload,
    retryDownload,
    pauseAll,
    resumeAll,
    moveToFront,
    move,
    exportQueue,
    importQueue,
    scheduleStart,
    getScheduledStart,
    updateMetadata,
    clearFinishedDownloads
  } = createOnlineDownloads(markVideoDownloaded);
  const {
    resolved,
    isResolving,
    resolvedLoading,
    resolvedCapped,
    selectedResolved,
    setResolved,
    loadMoreResolved
  } = createOnlineResolved();

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

  const {
    queuingId,
    queueingChannelId,
    resolveOnline,
    queueFromResolved,
    queueVideo,
    queueChannelVideos,
    queueBatch,
    loadAllResolvedItems
  } = createOnlineQueue({
    t,
    channel,
    resolved,
    downloads,
    getSubscription,
    addSubscription,
    submitJobs
  });

  const {
    checkingSubscriptions,
    checkingChannelId,
    followChannel,
    followChannelWithSetup,
    unfollowChannel,
    setAutoDownload,
    setDownloadPrefs,
    checkSubscriptionsNow,
    checkChannelNow
  } = createOnlineSubscriptionActions({
    addSubscription,
    removeSubscription,
    loadSubscriptions,
    queueChannelVideos
  });

  // Opens the channel/profile view for an @/$ prefixed query.
  async function openChannelPrefix(prefix: { platform: 'youtube' | 'soundcloud'; name: string }) {
    await openChannel(channelUrlForPrefix(prefix));
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
  const { queueSavedTrack, playAllStreams } = createOnlineStreams();

  const { syncingSavedPlaylistState, syncSavedPlaylist, playSavedPlaylist } =
    createOnlineSaved(playAllStreams);

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
