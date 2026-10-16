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
import { mapLimit } from '@renderer/utils/mapLimit';

// Ile linków rozwiązujemy równolegle. Bez limitu wklejenie 100 linków uruchamiało
// 100 równoległych yt-dlp w procesie głównym (ryzyko throttlingu/bot-blocku YouTube).
const RESOLVE_CONCURRENCY = 4;

export interface OnlineQueueDeps {
  t: (key: string, values?: Record<string, unknown>) => string;
  channel: Ref<YouTubeChannel | null>;
  resolved: Ref<YouTubeResolveResult | null>;
  downloads: Ref<DownloadTask[]>;
  getSubscription: (channelId: string) => Subscription | undefined;
  addSubscription: (sub: Subscription) => void;
  submitJobs: (jobs: IpcDownloadJobInput[]) => Promise<string[]>;
}

// Akcje kolejkowania dla elementów online (pojedynczy, partia rozwiązana i całe kanały)
// wyodrębnione z `stores/online.ts` (plan 2.7). Store destrukturyzuje
// zwrócone refy/akcje z powrotem do tych samych nazw, więc miejsca wywołań pozostają bez zmian.
export function createOnlineQueue(deps: OnlineQueueDeps) {
  const { t, channel, resolved, downloads, getSubscription, addSubscription, submitJobs } = deps;
  // Zbiory zamiast pojedynczych slotów: dwa równoległe `queueChannelVideos` (np.
  // auto-pobieranie wielu subskrypcji) nie mogą się wzajemnie zerować — wcześniej
  // `finally` pierwszego kasowało spinne drugiego.
  const queuingIds = ref<Set<string>>(new Set());
  const queueingChannelIds = ref<Set<string>>(new Set());

  function isQueuing(videoId: string): boolean {
    return queuingIds.value.has(videoId);
  }

  function isChannelQueuing(channelId: string): boolean {
    return queueingChannelIds.value.has(channelId);
  }

  function markQueuing(videoId: string, on: boolean): void {
    const next = new Set(queuingIds.value);
    if (on) next.add(videoId);
    else next.delete(videoId);
    queuingIds.value = next;
  }

  function markChannelQueuing(channelId: string, on: boolean): void {
    const next = new Set(queueingChannelIds.value);
    if (on) next.add(channelId);
    else next.delete(channelId);
    queueingChannelIds.value = next;
  }

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
    markQueuing(video.id, true);
    try {
      await submitJobs([job]);
    } finally {
      markQueuing(video.id, false);
    }
  }

  async function recordQueuedVideos(channelId: string, videoIds: string[]) {
    const ids = videoIds.filter((id): id is string => !!id);
    if (!ids.length) return;
    const sub = getSubscription(channelId);
    const merged = Array.from(new Set([...(sub?.queuedVideoIds || []), ...ids]));
    // pendingCount to liczba filmów z kanału jeszcze niezakolejkowanych/niepobranych.
    // Po zakolejkowaniu nowej partii, odejmujemy dodane pozycje od oczekujących.
    const nextPending = Math.max(0, (sub?.pendingCount ?? ids.length) - ids.length);
    if (sub) {
      addSubscription({ ...sub, queuedVideoIds: merged, pendingCount: nextPending });
    }
    try {
      const updated = (await window.api.invoke('yt:subs:update', channelId, {
        queuedVideoIds: merged,
        pendingCount: nextPending
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
    // Tylko aktywne zadania w kolejce (pobierane, oczekujące, wstrzymane) blokują ponowne zakolejkowanie.
    // O tym, czy film został już trwale pobrany z kanału, decyduje zbiór downloadedIds.
    const activeQueueIds = new Set(
      downloads.value
        .filter(
          (d) => d.status === 'pending' || d.status === 'downloading' || d.status === 'paused'
        )
        .map((d) => d.videoId)
    );
    const jobs: IpcDownloadJobInput[] = [];
    markChannelQueuing(channelId, true);
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
            activeQueueIds,
            downloadedIds
          )
        );
      } else {
        useUIStore().notify('warning', t('youtube.downloadAll'), t('youtube.channelQueueFailed'));
      }
      if (res?.success && jobs.length === 0) {
        useUIStore().notify('info', t('youtube.downloadAll'), t('youtube.nothingToQueue'));
      }
      // `submitJobs` zwraca TYLKO przyjęte zadania (main deduplikuje i odrzuca
      // duplikaty), więc zakolejkowane id liczymy z wyniku, a nie z `jobs` — inaczej
      // UI zaniżał/oznaczał jako zakolejkowane wideo bez zadania.
      const addedVideoIds = jobs.length ? await submitJobs(jobs) : [];
      const addedCount = addedVideoIds.length;
      if (addedCount > 0) {
        useUIStore().notify(
          'success',
          t('youtube.downloadAll'),
          t('youtube.channelQueued', { count: addedCount })
        );
      }
      await recordQueuedVideos(channelId, addedVideoIds);
    } finally {
      markChannelQueuing(channelId, false);
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
    // Rozwiązywanie z ograniczoną współbieżnością (zachowuje kolejność); bez
    // limitu partia N linków startowała N procesów yt-dlp naraz.
    const resolvedList = await mapLimit(urls, RESOLVE_CONCURRENCY, async (url) => {
      try {
        const res = await resolveOnline(url);
        return res?.success && res.result ? res.result : null;
      } catch {
        return null;
      }
    });

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
  }

  // Ładuje każdą stronę aktualnie istotnej playlisty (używane, gdy użytkownik
  // ją zapisuje), więc snapshot zawiera pełną listę, a nie tylko pierwszą stronę.
  async function loadAllResolvedItems(url: string) {
    return resolveAllPlaylistItems(url);
  }

  return {
    queuingIds,
    isQueuing,
    queueingChannelIds,
    isChannelQueuing,
    resolveOnline,
    queueFromResolved,
    queueVideo,
    queueChannelVideos,
    queueBatch,
    loadAllResolvedItems
  };
}
