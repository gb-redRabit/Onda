import { ref, type Ref } from 'vue';
import { buildSoundcloudProfileUrl, buildYouTubeChannelUrl } from '@shared/provider';
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

// Akcje kolejkowania dla elementów online (pojedynczy, partia rozwiązana i całe kanały)
// wyodrębnione z `stores/online.ts` (plan 2.7). Store destrukturyzuje
// zwrócone refy/akcje z powrotem do tych samych nazw, więc miejsca wywołań pozostają bez zmian.
export function createOnlineQueue(deps: OnlineQueueDeps) {
  const { t, channel, resolved, downloads, getSubscription, addSubscription, submitJobs } = deps;
  const queuingId = ref<string | null>(null);
  const queueingChannelId = ref<string | null>(null);
  // Rozwiązywanie linków z dyspozycją po platformie (wykrywa platformę z samego
  // linku, a nie z aktywnej zakładki UI).
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
    // Listy kanału pochodzą z płaskiej playlisty bez channel_id na wpis,
    // więc oznacz zadanie kanałem aktualnie przeglądanym.
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
      /* nie udało się zapisać zakolejkowanych id */
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
    // Tylko aktywne lub zakończone zadania blokują ponowne zakolejkowanie — nieudana/anulowana próba
    // musi być możliwa do ponownego zakolejkowania, inaczej "pobierz wszystko" po cichu ją pomija na zawsze.
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
            url: buildSoundcloudProfileUrl(channelId)
          })) as { success?: boolean; items?: YouTubeVideo[] })
        : ((await window.api.invoke('yt:channelAll', {
            url: buildYouTubeChannelUrl(channelId),
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

  // Rozwiązuje i kolejkuje partię linków (wideo i elementy pierwszej strony
  // playlisty; kanały są pomijane) między platformami. Zwraca, ile pobrań
  // zostało zakolejkowanych.
  //
  // Wszystkie zadania są zbierane i wysyłane JEDNYM `submitJobs`, zamiast wywoływać
  // `queueVideo` (osobne IPC `yt:download:add`) per element — wcześniej partia
  // N linków robiła do 1+N round-tripów sekwencyjnie.
  async function queueBatch(urls: string[], extra?: JobExtra): Promise<number> {
    queuingId.value = 'batch';
    try {
      // Rozwiązywanie równoległe (bezpieczne: tylko sieć), kolejność zachowana.
      const resolvedList = await Promise.all(
        urls.map(async (url) => {
          try {
            const res = await resolveOnline(url);
            return res?.success && res.result ? res.result : null;
          } catch {
            return null;
          }
        })
      );

      const jobs: IpcDownloadJobInput[] = [];
      for (const result of resolvedList) {
        if (!result) continue;
        const items =
          result.kind === 'video'
            ? result.items.slice(0, 1)
            : result.kind === 'playlist'
              ? result.items
              : [];
        for (const item of items) {
          const job = buildJob(item, undefined, extra);
          if (!job.channelId && channel.value?.id) job.channelId = channel.value.id;
          if (!job.channelTitle && channel.value?.title) job.channelTitle = channel.value.title;
          jobs.push(job);
        }
      }
      if (jobs.length) await submitJobs(jobs);
      return jobs.length;
    } finally {
      queuingId.value = null;
    }
  }

  // Ładuje każdą stronę aktualnie istotnej playlisty (używane, gdy użytkownik
  // ją zapisuje), więc snapshot zawiera pełną listę, a nie tylko pierwszą stronę.
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
