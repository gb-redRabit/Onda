import { logger } from '../../shared/logger';
import type { IpcNewVideosEvent, IpcSubscriptionCheckResult } from '../../shared/types/ipc';
import {
  loadSubscriptions,
  updateSubscription,
  type SubscriptionPatch
} from './subscriptions-store';
import { fetchChannelItems, fetchChannelAll } from './youtube-handlers';
import { computeChannelDiff } from './channel-diff';
import { addDownloadJobs } from '../downloads/download-manager';
import { getStore } from './cover-cache';
import { broadcastToAllWindows } from '../utils/broadcast';

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
// Guards against overlapping checks (interval + manual "check now" + per-channel
// check). Without it, two concurrent runs could race on queuedVideoIds and
// double-enqueue the same video.
let checkRunning = false;

export interface ChannelVideoSummary {
  id: string;
  title: string;
  thumbnail: string;
}

export interface ChannelSnapshot {
  items: ChannelVideoSummary[];
  thumbnail: string;
  title: string;
}

// Pobiera WSZYSTKIE wideo kanału w JEDNYM wywołaniu `--flat-playlist -J`
// (bez stronicowania) — dzięki temu „sprawdź kanał" nie wydaje dziesiątek
// osobnych procesów yt-dlp.
async function fetchAllChannelVideos(channelId: string): Promise<ChannelSnapshot> {
  const url = `https://www.youtube.com/channel/${channelId}`;
  const res = await fetchChannelAll({ url, tab: 'videos' });
  const out: ChannelVideoSummary[] = res.items.map((item) => ({
    id: item.id,
    title: item.title,
    thumbnail: item.thumbnail || ''
  }));
  return {
    items: out,
    thumbnail: res.channel?.thumbnail || '',
    title: res.channel?.title || ''
  };
}

async function readAutoDownloadSettings(): Promise<{
  enabled: boolean;
  defaultPath: string;
  defaultAudioFormat: string;
  defaultVideoQuality: string;
  filenameTemplate: string;
  defaultKind: string;
  defaultSubs: boolean;
  defaultSubsLangs: string;
  defaultAudioQuality: string;
}> {
  try {
    const store = await getStore();
    const download = store.get('download') as
      | {
          autoDownloadSubscriptions?: boolean;
          defaultPath?: string;
          defaultAudioFormat?: string;
          defaultAudioQuality?: string;
          defaultVideoQuality?: string;
          filenameTemplate?: string;
          defaultKind?: string;
          defaultSubs?: boolean;
          defaultSubsLangs?: string;
        }
      | undefined;
    return {
      enabled: !!download?.autoDownloadSubscriptions,
      defaultPath: download?.defaultPath || '',
      defaultAudioFormat: download?.defaultAudioFormat || 'mp3',
      defaultVideoQuality: download?.defaultVideoQuality || 'best',
      filenameTemplate: download?.filenameTemplate || '{title} - {artist}',
      defaultKind: download?.defaultKind || 'audio',
      defaultSubs: !!download?.defaultSubs,
      defaultSubsLangs: download?.defaultSubsLangs || 'pl,en',
      defaultAudioQuality: download?.defaultAudioQuality || 'best'
    };
  } catch {
    return {
      enabled: false,
      defaultPath: '',
      defaultAudioFormat: 'mp3',
      defaultVideoQuality: 'best',
      filenameTemplate: '{title} - {artist}',
      defaultKind: 'audio',
      defaultSubs: false,
      defaultSubsLangs: 'pl,en',
      defaultAudioQuality: 'best'
    };
  }
}

// Ustawia punkt odniesienia tuż po subskrypcji: zapamiętuje najnowszy film
// kanału jako baselineVideoId, więc auto-pobieranie nie ściągnie całej historii
// kanału, a jedynie filmy nowsze od tego punktu. baselineVideoId trafia do
// OSOBNEGO pola, a NIE do downloadedVideoIds — to drugie oznacza wyłącznie
// filmy faktycznie pobrane.
export async function seedSubscriptionBaseline(filePath: string, channelId: string): Promise<void> {
  try {
    const res = await fetchChannelItems({
      url: `https://www.youtube.com/channel/${channelId}`,
      tab: 'videos',
      start: 1,
      end: 1
    });
    if (res.success && res.items.length > 0) {
      await updateSubscription(filePath, channelId, {
        lastChecked: Date.now(),
        lastVideoId: res.items[0].id,
        baselineVideoId: res.items[0].id,
        pendingCount: 0
      });
    }
  } catch {
    // Bazę ustawi pierwszy pełny check.
  }
}

export async function checkSubscriptions(
  filePath: string,
  onlyChannelId?: string
): Promise<IpcSubscriptionCheckResult> {
  if (checkRunning) {
    logger.warn('subscriptions', 'check already in progress — skipping concurrent run');
    return { checked: 0, newVideos: 0, queued: 0, errors: 0 };
  }
  checkRunning = true;
  try {
    return await runCheck(filePath, onlyChannelId);
  } finally {
    checkRunning = false;
  }
}

async function runCheck(
  filePath: string,
  onlyChannelId?: string
): Promise<IpcSubscriptionCheckResult> {
  const subs = await loadSubscriptions(filePath);
  const target = onlyChannelId ? subs.filter((s) => s.channelId === onlyChannelId) : subs;
  const globalConfig = await readAutoDownloadSettings();
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  let checked = 0;
  let newVideos = 0;
  let queued = 0;
  let errors = 0;
  for (const sub of target) {
    if (Date.now() > deadline) {
      logger.warn('subscriptions', 'checker time limit reached — stopping early');
      break;
    }
    try {
      const { items: all, thumbnail, title } = await fetchAllChannelVideos(sub.channelId);
      // Separates "new" (before baseline) from "not downloaded" and "downloaded"
      // using the subscription's persisted state.
      const { newArrivals, remainingCount } = computeChannelDiff({
        items: all,
        downloadedVideoIds: sub.downloadedVideoIds || [],
        queuedVideoIds: sub.queuedVideoIds || [],
        baselineVideoId: sub.baselineVideoId
      });
      const lastChecked = Date.now();
      const latest = all[0];

      const basePatch: SubscriptionPatch = {
        lastChecked,
        lastVideoId: latest?.id || sub.lastVideoId,
        pendingCount: remainingCount,
        newArrivals: newArrivals.length,
        channelThumbnail: thumbnail || sub.channelThumbnail,
        channelTitle: title || sub.channelTitle
      };

      const wantsDownload = newArrivals.length > 0 && sub.autoDownload && globalConfig.enabled;
      if (wantsDownload) {
        // Public videos can be downloaded anonymously; yt-dlp reports a specific
        // error for age-restricted / private / members-only content, which the
        // download manager classifies and surfaces in the UI.
        const enqueueIds = newArrivals.map((i) => i.id);
        const jobs = newArrivals.map((i) => ({
          url: `https://www.youtube.com/watch?v=${i.id}`,
          title: i.title,
          thumbnail: i.thumbnail,
          kind: (sub.downloadPrefs?.kind || globalConfig.defaultKind || 'audio') as 'audio' | 'video',
          format: sub.downloadPrefs?.format || globalConfig.defaultAudioFormat,
          quality: sub.downloadPrefs?.quality || globalConfig.defaultVideoQuality,
          outputDir: sub.downloadPrefs?.outputDir || globalConfig.defaultPath,
          filenameTemplate: sub.downloadPrefs?.filenameTemplate || globalConfig.filenameTemplate,
          videoId: i.id,
          channelId: sub.channelId,
          channelTitle: sub.channelTitle,
          audioQuality: sub.downloadPrefs?.audioQuality || globalConfig.defaultAudioQuality,
          audioLanguage: sub.downloadPrefs?.audioLanguage,
          cover: sub.downloadPrefs?.cover,
          subsLangs:
            sub.downloadPrefs?.subsLangs ??
            (globalConfig.defaultSubs ? globalConfig.defaultSubsLangs : undefined),
          subsFormat: sub.downloadPrefs?.subsFormat,
          subsMode: sub.downloadPrefs?.subsMode,
          subsFolder: sub.downloadPrefs?.subsFolder,
          metaOverride: sub.downloadPrefs?.metaOverride,
          sponsorBlock: sub.downloadPrefs?.sponsorBlock,
          trimStart: sub.downloadPrefs?.trimStart,
          trimEnd: sub.downloadPrefs?.trimEnd,
          addToLibrary: sub.downloadPrefs?.addToLibrary
        }));
        queued += (await addDownloadJobs(jobs)).length;
        // Nowe wideo są w kolejce — zapamiętaj je w OSOBNYM polu queuedVideoIds,
        // żeby kolejny check nie dodawał ich ponownie (dedup) bez fałszywego
        // oznaczania jako „pobrane". downloadedVideoIds pozostaje wyłącznie dla
        // filmów, które faktycznie zakończyły pobieranie.
        await updateSubscription(filePath, sub.channelId, {
          ...basePatch,
          downloadPrefs: sub.downloadPrefs,
          autoDownload: sub.autoDownload,
          downloadedVideoIds: [...(sub.downloadedVideoIds || [])],
          queuedVideoIds: Array.from(new Set([...(sub.queuedVideoIds || []), ...enqueueIds]))
        });
      } else {
        await updateSubscription(filePath, sub.channelId, basePatch);
      }
      if (newArrivals.length > 0) {
        const event: IpcNewVideosEvent = {
          channelId: sub.channelId,
          channelTitle: title || sub.channelTitle,
          count: newArrivals.length,
          titles: newArrivals.slice(0, 3).map((i) => i.title)
        };
        broadcastToAllWindows('yt:newVideos', event);
      }
      if (all.length > 0) newVideos += newArrivals.length;
      checked++;
    } catch {
      errors++;
    }
  }
  logger.info(
    'subscriptions',
    `check done: checked=${checked} newVideos=${newVideos} queued=${queued} errors=${errors}`
  );
  return { checked, newVideos, queued, errors };
}

// Checks a single channel (per-channel "check now" button).
export async function checkSingleChannel(
  filePath: string,
  channelId: string
): Promise<IpcSubscriptionCheckResult> {
  return checkSubscriptions(filePath, channelId);
}

export function startSubscriptionChecker(
  filePath: string,
  intervalMs: number = CHECK_INTERVAL_MS
): void {
  stopSubscriptionChecker();
  void checkSubscriptions(filePath);
  timer = setInterval(() => void checkSubscriptions(filePath), intervalMs);
}

export function stopSubscriptionChecker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
