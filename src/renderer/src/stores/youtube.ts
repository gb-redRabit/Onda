import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import type {
  YouTubeVideo,
  YouTubeResolveResult,
  YouTubeResolvedItem,
  YouTubeChannel,
  Subscription,
  SubscriptionDownloadPrefs,
  DownloadTask,
  CoverSpec,
  CoverStatus,
  MetaOverride
} from '@renderer/types/youtube';
import type { IpcDownloadJobInput, IpcDownloadTask, IpcSubscription } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { youtubeProvider } from '@shared/provider';

export interface JobExtra {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  filenameTemplate?: string;
  cover?: CoverSpec;
  metaOverride?: MetaOverride;
  channelTitle?: string;
  playlistTitle?: string;
  outputDir?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioLanguage?: string;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
}

function toDownloadTask(ipc: IpcDownloadTask): DownloadTask {
  return {
    id: ipc.id,
    url: ipc.url,
    title: ipc.title,
    thumbnail: ipc.thumbnail,
    kind: ipc.kind,
    format: ipc.format,
    quality: ipc.quality,
    outputPath: ipc.outputPath,
    outputDir: ipc.outputDir,
    progress: ipc.progress,
    speed: ipc.speed,
    eta: ipc.eta,
    status: ipc.status,
    error: ipc.error,
    errorCode: ipc.errorCode,
    startedAt: ipc.startedAt,
    completedAt: ipc.completedAt,
    videoId: ipc.videoId,
    channelId: ipc.channelId,
    channelTitle: ipc.channelTitle,
    playlistTitle: ipc.playlistTitle,
    cover: ipc.cover,
    coverStatus: ipc.coverStatus,
    metaOverride: ipc.metaOverride,
    inLibrary: ipc.inLibrary,
    fileHash: ipc.fileHash,
    subsLangs: ipc.subsLangs,
    subsFormat: ipc.subsFormat,
    subsMode: ipc.subsMode,
    subsFolder: ipc.subsFolder,
    subtitleStatus: ipc.subtitleStatus,
    audioQuality: ipc.audioQuality,
    audioLanguage: ipc.audioLanguage,
    videoContainer: ipc.videoContainer,
    sponsorBlock: ipc.sponsorBlock,
    trimStart: ipc.trimStart,
    trimEnd: ipc.trimEnd,
    addToLibrary: ipc.addToLibrary,
    source: ipc.source
  };
}

export const useYouTubeStore = defineStore('youtube', () => {
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
  const settings = useSettingsStore();
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
    const nextStart = r.items.length + 1;
    const res = await window.api.invoke('yt:resolveMore', {
      url: r.sourceUrl,
      start: nextStart,
      end: nextStart + 29
    });
    if (!res || !res.success || res.items.length === 0) return false;
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
    return res.hasMore;
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

  type VideoSource = YouTubeVideo | YouTubeResolvedItem;

  function defaultCoverSpec(): CoverSpec | undefined {
    const d = settings.download;
    switch (d.defaultCover) {
      case 'thumbnail':
        return { type: 'thumbnail' };
      case 'frame':
        return { type: 'frame', frameTime: d.defaultCoverFrameTime };
      case 'clip':
        return {
          type: 'clip',
          clipStart: d.defaultCoverClipStart,
          clipEnd: d.defaultCoverClipEnd,
          clipFormat: d.defaultCoverClipFormat
        };
      default:
        return undefined;
    }
  }

  function buildJob(
    video: VideoSource,
    prefs?: SubscriptionDownloadPrefs,
    extra?: JobExtra
  ): IpcDownloadJobInput {
    const kind = extra?.kind ?? prefs?.kind ?? settings.download.defaultKind ?? 'audio';
    const format =
      kind === 'video'
        ? extra?.format ?? prefs?.format ?? 'best'
        : extra?.format ?? prefs?.format ?? settings.download.defaultAudioFormat;
    const quality = extra?.quality ?? prefs?.quality ?? settings.download.defaultVideoQuality;
    const audioQuality = extra?.audioQuality ?? prefs?.audioQuality ?? settings.download.defaultAudioQuality;
    const videoContainer =
      extra?.videoContainer ?? settings.download.defaultVideoContainer ?? 'mp4';
    // Audio covers follow the global default (thumbnail/frame/clip/none); video
    // downloads always embed the YouTube thumbnail by default. An explicit
    // cover (including `none`) always wins over the defaults.
    const cover =
      extra?.cover !== undefined || prefs?.cover !== undefined
        ? extra?.cover ?? prefs?.cover
        : kind === 'audio'
          ? defaultCoverSpec()
          : ({ type: 'thumbnail' } as const);
    const subsLangs =
      extra?.subsLangs ??
      prefs?.subsLangs ??
      (settings.download.defaultSubs ? settings.download.defaultSubsLangs : undefined);
    logger.info(
      'yt',
      `buildJob kind=${kind} defaultSubs=${settings.download.defaultSubs} subsLangs=${subsLangs || 'none'}`
    );
    return {
      url: youtubeProvider.buildWatchUrl(video.id),
      title: video.title,
      thumbnail: video.thumbnail,
      kind,
      format,
      quality,
      audioQuality,
      outputDir: extra?.outputDir ?? prefs?.outputDir ?? settings.download.defaultPath ?? '',
      filenameTemplate:
        extra?.filenameTemplate ??
        prefs?.filenameTemplate ??
        settings.download.filenameTemplate ??
        '{title} - {artist}',
      videoId: video.id,
      channelId: video.channelId,
      channelTitle: extra?.channelTitle || video.channelTitle,
      playlistTitle: extra?.playlistTitle,
      cover,
      metaOverride: extra?.metaOverride ?? prefs?.metaOverride,
      subsLangs,
      subsFormat: extra?.subsFormat,
      subsMode: extra?.subsMode,
      subsFolder: extra?.subsFolder,
      audioLanguage: extra?.audioLanguage ?? prefs?.audioLanguage,
      videoContainer,
      sponsorBlock: extra?.sponsorBlock ?? prefs?.sponsorBlock ?? 'off',
      trimStart: extra?.trimStart ?? prefs?.trimStart,
      trimEnd: extra?.trimEnd ?? prefs?.trimEnd,
      addToLibrary: extra?.addToLibrary ?? prefs?.addToLibrary
    };
  }

  function upsertTask(task: DownloadTask) {
    const idx = downloads.value.findIndex((d) => d.id === task.id);
    const prev = idx >= 0 ? downloads.value[idx] : undefined;
    const becameCompleted = task.status === 'completed' && prev?.status !== 'completed';
    const becameError = task.status === 'error' && (!prev || prev.status !== 'error');
    if (idx >= 0) downloads.value[idx] = task;
    else downloads.value.push(task);
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

  function buildTaskInput(task: DownloadTask): IpcDownloadJobInput {
    return {
      url: task.url,
      title: task.title,
      thumbnail: task.thumbnail,
      kind: task.kind,
      format: task.format || settings.download.defaultAudioFormat,
      quality: task.quality || settings.download.defaultVideoQuality,
      outputDir: task.outputDir || settings.download.defaultPath || '',
      filenameTemplate: settings.download.filenameTemplate || '{title} - {artist}',
      videoId: task.videoId,
      channelId: task.channelId,
      channelTitle: task.channelTitle,
      playlistTitle: task.playlistTitle,
      cover: task.cover,
      metaOverride: task.metaOverride,
      subsLangs: task.subsLangs,
      subsFormat: task.subsFormat,
      subsMode: task.subsMode,
      subsFolder: task.subsFolder,
      audioQuality: task.audioQuality,
      audioLanguage: task.audioLanguage,
      videoContainer: task.videoContainer || settings.download.defaultVideoContainer,
      sponsorBlock: task.sponsorBlock,
      trimStart: task.trimStart,
      trimEnd: task.trimEnd,
      addToLibrary: task.addToLibrary,
      source: task.source
    };
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

  // Status of the download task for a given video id (used to show a loading /
  // downloading / done state on the quick "download" button).
  function downloadStatusFor(videoId: string): DownloadTask['status'] | null {
    if (!videoId) return null;
    const task = downloads.value.find((d) => d.videoId === videoId);
    return task ? task.status : null;
  }

  // Cover-processing status of the task for a video (used to show that the
  // animated cover is still being prepared after the audio download finished).
  function coverStatusFor(videoId: string): CoverStatus | null {
    if (!videoId) return null;
    const task = downloads.value.find((d) => d.videoId === videoId);
    return task?.coverStatus ?? null;
  }

  // Resolves and queues a batch of YouTube links (videos and playlist first-page
  // items; channels are skipped). Returns how many downloads were enqueued.
  async function queueBatch(urls: string[], extra?: JobExtra): Promise<number> {
    let queued = 0;
    for (const url of urls) {
      try {
        const res = (await window.api.invoke('yt:resolve', url)) as
          | { success?: boolean; result?: YouTubeResolveResult }
          | undefined;
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
    const channelUrl = `https://www.youtube.com/channel/${channelId}`;
    const subscription = getSubscription(channelId);
    const downloadedIds = includeDownloaded
      ? new Set<string>()
      : new Set(subscription?.downloadedVideoIds || []);
    const existingIds = new Set(downloads.value.map((d) => d.videoId));
    const jobs: IpcDownloadJobInput[] = [];
    queueingChannelId.value = channelId;
    try {
      const res = (await window.api.invoke('yt:channelAll', {
        url: channelUrl,
        tab: 'videos'
      })) as { success?: boolean; items?: YouTubeVideo[] };
      if (res?.success && res.items) {
        for (const item of res.items) {
          if (!item.id || existingIds.has(item.id) || downloadedIds.has(item.id)) continue;
          const job = buildJob(item, prefs);
          // Flat-playlist entries carry no channel_id — always attribute to the
          // channel being downloaded so finished jobs are recorded correctly.
          if (!job.channelId) job.channelId = channelId;
          jobs.push(job);
          existingIds.add(item.id);
        }
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
    channelErrorCode.value = '';
    channelLoading.value = true;
    try {
      const res = await window.api.invoke('yt:channel', { url: channelInput.value, tab });
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
      const res = await window.api.invoke('yt:channel', {
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
  }) {
    try {
      const sub = (await window.api.invoke('yt:subs:add', channel)) as Subscription | null;
      if (sub) addSubscription(sub);
    } catch {
      /* failed to follow */
    }
  }

  async function followChannelWithSetup(
    channel: { channelId: string; channelTitle: string; channelThumbnail: string },
    setup: { prefs?: SubscriptionDownloadPrefs; downloadAll: boolean }
  ) {
    try {
      const input = {
        ...channel,
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
      if (Array.isArray(list)) downloads.value = list.map(toDownloadTask);
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
    await submitJobs([buildTaskInput(task)]);
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
        (d) => d.status === 'pending' || d.status === 'downloading'
      );
    } catch {
      /* clear failed */
    }
  }

  subscribeDownloads();
  subscribeSubscriptionUpdates();
  void loadDownloads();
  void loadSubscriptions();

  return {
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
