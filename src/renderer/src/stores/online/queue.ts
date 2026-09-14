import { ref, type Ref } from 'vue';
import { useUIStore } from '@renderer/stores/ui';
import type {
  DownloadTask,
  Subscription,
  SubscriptionDownloadPrefs,
  YouTubeChannel,
  YouTubeResolveResult,
  YouTubeResolvedItem,
  YouTubeVideo
} from '@renderer/types/online';
import type { IpcDownloadJobInput } from '@shared/types/ipc';
import { buildJob, type JobExtra } from '@renderer/utils/onlineJob';
import { buildChannelJobs } from '@renderer/utils/onlineChannelJobs';
import { resolveOnlineUrl, type OnlineResolveResponse } from '@renderer/utils/onlineResolve';
import { resolveAllPlaylistItems } from '@renderer/utils/onlineResolveAll';

export interface OnlineQueueDeps {
  t: (key: string) => string;
  channel: Ref<YouTubeChannel | null>;
  resolved: Ref<YouTubeResolveResult | null>;
  downloads: Ref<DownloadTask[]>;
  getSubscription: (channelId: string) => Subscription | undefined;
  addSubscription: (sub: Subscription) => void;
  submitJobs: (jobs: IpcDownloadJobInput[]) => Promise<unknown>;
}

// Queueing actions for online items (single, resolved batch and whole channels)
// extracted from `stores/online.ts` (plan 2.7). The store destructures the
// returned refs/actions back into the same names, so call sites are unchanged.
export function createOnlineQueue(deps: OnlineQueueDeps) {
  const { t, channel, resolved, downloads, getSubscription, addSubscription, submitJobs } = deps;
  const queuingId = ref<string | null>(null);
  const queueingChannelId = ref<string | null>(null);

  // Platform-dispatched link resolution (detects the platform from the link
  // itself, not from the active UI tab).
  async function resolveOnline(url: string): Promise<OnlineResolveResponse> {
    return resolveOnlineUrl(url);
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

  // Loads every page of the currently relevant playlist (used when the user
  // saves it) so the snapshot contains the full list, not just the first page.
  async function loadAllResolvedItems(url: string) {
    return resolveAllPlaylistItems(url);
  }

  return {
    queuingId,
    queueingChannelId,
    resolveOnline,
    queueFromResolved,
    queueVideo,
    queueChannelVideos,
    queueBatch,
    loadAllResolvedItems
  };
}
