import { readdir } from 'fs/promises';
import { extname, join } from 'path';
import { logger } from '../../../shared/logger';
import type { IpcNewVideosEvent, IpcSubscriptionCheckResult } from '../../../shared/types/ipc';
import { AUDIO_EXTS, VIDEO_EXTS } from '../../../shared/constants';
import {
  appendDownloadedVideos,
  loadSubscriptions,
  updateSubscription,
  reconcileDownloadedFiles,
  type SubscriptionPatch
} from './subscriptions-store';
import { matchDownloadedFiles, type OutputFileRef } from './subscription-file-match';
import { fetchChannelItems, fetchChannelAll } from '../youtube/youtube-handlers';
import { computeChannelDiff } from '../channel-diff';
import { addDownloadJobs, listDownloadJobs } from '../../downloads/download-manager';
import { getStore } from '../cover/cover-cache';
import { broadcastToAllWindows } from '../../utils/broadcast';
import { scProfileSnapshot, sanitizeFileName } from '../soundcloud/soundcloud-client';

const AUDIO_EXT_SET = new Set(AUDIO_EXTS);
const VIDEO_EXT_SET = new Set(VIDEO_EXTS);
const MAX_BACKFILL_FILES = 20000;
const MAX_BACKFILL_DEPTH = 4;

// Lista plików w katalogu pobrań subskrypcji — do uzupełnienia mapy videoId→ścieżka
// dla pobrań sprzed wprowadzenia `downloadedFiles`.
async function collectOutputFiles(root: string): Promise<OutputFileRef[]> {
  const out: OutputFileRef[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length > 0 && out.length < MAX_BACKFILL_FILES) {
    const current = queue.shift();
    if (!current) break;
    let entries;
    try {
      entries = await readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= MAX_BACKFILL_FILES) break;
      if (entry.isDirectory()) {
        if (current.depth < MAX_BACKFILL_DEPTH) {
          queue.push({ dir: join(current.dir, entry.name), depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!AUDIO_EXT_SET.has(ext) && !VIDEO_EXT_SET.has(ext)) continue;
      out.push({ name: entry.name, path: join(current.dir, entry.name) });
    }
  }
  return out;
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
// Chroni przed nakładającymi się sprawdzeniami (interwał + ręczne "sprawdź teraz" + sprawdzenie
// per kanał). Bez tego dwa równoczesne przebiegi mogłyby się ścigać na queuedVideoIds i
// podwójnie zakolejkować ten sam film.
let checkRunning = false;

interface ChannelVideoSummary {
  id: string;
  title: string;
  thumbnail: string;
  // Kanoniczny URL strony — ustawiany dla utworów SoundCloud (permalink potrzebny do
  // zadania pobierania; id YT są odtwarzane w URL-e watch).
  url?: string;
}

interface ChannelSnapshot {
  items: ChannelVideoSummary[];
  thumbnail: string;
  title: string;
}

type SubPlatform = 'youtube' | 'soundcloud';

function platformOf(sub: { platform?: SubPlatform }): SubPlatform {
  return sub.platform === 'soundcloud' ? 'soundcloud' : 'youtube';
}

// Pobiera WSZYSTKIE wideo kanału w JEDNYM wywołaniu `--flat-playlist -J`
// (bez stronicowania) — dzięki temu „sprawdź kanał" nie wydaje dziesiątek
// osobnych procesów yt-dlp. Dla SC — jeden snapshot profilu przez api-v2
// (paginacja do cap po stronie klienta).
async function fetchAllChannelVideos(
  channelId: string,
  platform: SubPlatform
): Promise<ChannelSnapshot> {
  if (platform === 'soundcloud') {
    const res = await scProfileSnapshot(`https://soundcloud.com/${channelId}`, 200);
    return {
      items: res.items.map((item) => ({
        id: item.id,
        title: item.title,
        thumbnail: item.thumbnail || '',
        url: item.url
      })),
      thumbnail: res.channel.thumbnail || '',
      title: res.channel.title || ''
    };
  }
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

// Ustawia punkt odniesienia tuż po subskrypcji: zapamiętuje najnowszy element
// kanału/profilu jako baselineVideoId, więc auto-pobieranie nie ściągnie
// całej historii, a jedynie pozycje nowsze od tego punktu. baselineVideoId
// trafia do OSOBNEGO pola, a NIE do downloadedVideoIds — to drugie oznacza
// wyłącznie pozycje faktycznie pobrane.
export async function seedSubscriptionBaseline(filePath: string, channelId: string): Promise<void> {
  try {
    const subs = await loadSubscriptions(filePath);
    const sub = subs.find((s) => s.channelId === channelId);
    const platform = platformOf(sub ?? {});
    if (platform === 'soundcloud') {
      const snapshot = await scProfileSnapshot(`https://soundcloud.com/${channelId}`, 5);
      if (snapshot.items.length > 0) {
        await updateSubscription(filePath, channelId, {
          lastChecked: Date.now(),
          lastVideoId: snapshot.items[0]!.id,
          baselineVideoId: snapshot.items[0]!.id,
          pendingCount: 0
        });
      }
      return;
    }
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

// `reconcile` (używane przez ręczne „sprawdź teraz") dodatkowo weryfikuje, czy pliki
// już pobranych filmów nadal istnieją na dysku i odznacza te, których brakuje.
// Harmonogram w tle wywołuje bez reconcile (mniej I/O, brak niespodzianek).
export async function checkSubscriptions(
  filePath: string,
  onlyChannelId?: string,
  reconcile = false
): Promise<IpcSubscriptionCheckResult> {
  if (checkRunning) {
    logger.warn('subscriptions', 'check already in progress — skipping concurrent run');
    return { checked: 0, newVideos: 0, queued: 0, errors: 0, busy: true };
  }
  checkRunning = true;
  try {
    return await runCheck(filePath, onlyChannelId, reconcile);
  } finally {
    checkRunning = false;
  }
}

async function runCheck(
  filePath: string,
  onlyChannelId?: string,
  reconcile = false
): Promise<IpcSubscriptionCheckResult> {
  const subs = await loadSubscriptions(filePath);
  const target = onlyChannelId ? subs.filter((s) => s.channelId === onlyChannelId) : subs;
  const globalConfig = await readAutoDownloadSettings();
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  let checked = 0;
  let newVideos = 0;
  let queued = 0;
  let errors = 0;
  const missing: Array<{ id: string; title: string }> = [];
  for (const sub of target) {
    if (Date.now() > deadline) {
      logger.warn('subscriptions', 'checker time limit reached — stopping early');
      break;
    }
    try {
      const platform = platformOf(sub);
      const { items: all, thumbnail, title } = await fetchAllChannelVideos(sub.channelId, platform);
      // Weryfikacja plików (tylko ręczne sprawdzenie): odznacza pobrane filmy, których
      // plik zniknął. Używa ŚWIEŻEGO zbioru `downloadedVideoIds` do zapisu/pendingCount,
      // ale diff poniżej liczy „nowe" na starym zbiorze — dzięki temu odznaczone filmy
      // NIE są kolejkowane w tym samym przebiegu (zostaną wykryte przy następnym).
      const downloadedIds = sub.downloadedVideoIds || [];
      const queuedIds = new Set(sub.queuedVideoIds || []);
      const activeVideoIds = new Set(
        listDownloadJobs()
          .filter(
            (j) =>
              !!j.videoId &&
              (j.status === 'pending' || j.status === 'downloading' || j.status === 'paused')
          )
          .map((j) => j.videoId)
      );
      const missingById = new Map<string, { id: string; title: string }>();
      let effectiveDownloaded: string[] = downloadedIds;

      if (reconcile) {
        const storedFiles = sub.downloadedFiles || {};
        const outputDir = sub.downloadPrefs?.outputDir;
        // Starsze subskrypcje nie mają `downloadedFiles` — dopasuj pliki po tytule,
        // inaczej po usunięciu pliku nie ma czego zweryfikować.
        if (outputDir && Object.keys(storedFiles).length < downloadedIds.length) {
          const filesOnDisk = await collectOutputFiles(outputDir);
          if (filesOnDisk.length > 0) {
            const preferredExt = sub.downloadPrefs?.format
              ? `.${sub.downloadPrefs.format.replace(/^\./, '')}`
              : sub.downloadPrefs?.kind === 'video'
                ? '.mp4'
                : '.mp3';
            const downloadedItems = all.filter((item) => downloadedIds.includes(item.id));
            const matched = matchDownloadedFiles(
              downloadedItems,
              filesOnDisk,
              title || sub.channelTitle,
              preferredExt
            );
            const matchedCount = Object.keys(matched.files).length;
            if (matchedCount > 0) {
              await appendDownloadedVideos(filePath, sub.channelId, [], matched.files);
              // Nie zgłaszaj masowych braków, gdy dopasowanie zawiodło (np. przeniesiony folder).
              const suspects = matched.unmatchedIds.filter(
                (id) => !queuedIds.has(id) && !activeVideoIds.has(id)
              );
              if (suspects.length <= Math.max(1, Math.floor(matchedCount * 0.1))) {
                for (const id of suspects) {
                  const item = all.find((i) => i.id === id);
                  missingById.set(id, { id, title: item?.title || id });
                }
              }
            }
          }
        }

        if (missingById.size > 0) {
          effectiveDownloaded = downloadedIds.filter((id) => !missingById.has(id));
        }
        const rec = await reconcileDownloadedFiles(filePath, sub.channelId);
        if (rec.updated) {
          effectiveDownloaded = (rec.updated.downloadedVideoIds || []).filter(
            (id) => !missingById.has(id)
          );
        }
        for (const id of rec.removedIds) {
          const item = all.find((i) => i.id === id);
          missingById.set(id, { id, title: item?.title || id });
        }
      }

      // Rozdziela "nowe" (przed baseline) od "niepobranych" i "pobranych"
      // na podstawie zapisanego stanu subskrypcji.
      const { newArrivals, remainingCount } = computeChannelDiff({
        items: all,
        downloadedVideoIds: sub.downloadedVideoIds || [],
        queuedVideoIds: sub.queuedVideoIds || [],
        baselineVideoId: sub.baselineVideoId
      });
      // pendingCount ma odzwierciedlać stan po odznaczeniu (usunięte pliki znów „do pobrania").
      let pendingAfterReconcile = remainingCount;
      if (reconcile) {
        const effectiveSet = new Set(effectiveDownloaded);
        pendingAfterReconcile = all.filter((i) => !effectiveSet.has(i.id)).length;
      }
      const knownIds = new Set(sub.downloadedVideoIds || []);
      const staleQueued = (sub.queuedVideoIds || []).filter(
        (id) => !knownIds.has(id) && !activeVideoIds.has(id)
      );
      const toQueue = [
        ...newArrivals,
        ...staleQueued
          .map((id) => all.find((i) => i.id === id))
          .filter((i): i is ChannelVideoSummary => !!i)
      ];
      const lastChecked = Date.now();
      const latest = all[0];

      const basePatch: SubscriptionPatch = {
        lastChecked,
        lastVideoId: latest?.id || sub.lastVideoId,
        pendingCount: pendingAfterReconcile,
        newArrivals: newArrivals.length,
        channelThumbnail: thumbnail || sub.channelThumbnail,
        channelTitle: title || sub.channelTitle,
        ...(reconcile ? { downloadedVideoIds: effectiveDownloaded } : {})
      };

      const wantsDownload = toQueue.length > 0 && sub.autoDownload && globalConfig.enabled;
      if (wantsDownload) {
        if (platform === 'soundcloud') {
          // SC: progressive MP3 przez api-v2 — job soundcloud rozwiązuje świeży
          // podpisany URL przy każdej próbie. Okładki/napisy/tagi pominięte
          // (surowe MP3 128 kbps).
          const scJobs = toQueue.map((i) => ({
            url: i.url || `https://soundcloud.com/${sub.channelId}`,
            title: i.title,
            thumbnail: i.thumbnail,
            kind: 'audio' as const,
            format: 'mp3',
            quality: '',
            outputDir: sub.downloadPrefs?.outputDir || globalConfig.defaultPath,
            filenameTemplate: sub.downloadPrefs?.filenameTemplate || globalConfig.filenameTemplate,
            videoId: i.id,
            channelId: sub.channelId,
            channelTitle: title || sub.channelTitle,
            addToLibrary: sub.downloadPrefs?.addToLibrary,
            source: {
              mode: 'soundcloud' as const,
              fileName: `${sanitizeFileName(i.title)}.mp3`
            }
          }));
          queued += (await addDownloadJobs(scJobs)).length;
        } else {
          // Publiczne filmy można pobierać anonimowo; yt-dlp zgłasza konkretny
          // błąd dla treści z ograniczeniem wiekowym / prywatnych / tylko dla członków, który
          // menedżer pobierania klasyfikuje i pokazuje w UI.
          const jobs = toQueue.map((i) => ({
            url: `https://www.youtube.com/watch?v=${i.id}`,
            title: i.title,
            thumbnail: i.thumbnail,
            kind: (sub.downloadPrefs?.kind || globalConfig.defaultKind || 'audio') as
              'audio' | 'video',
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
        }
        const enqueueIds = toQueue.map((i) => i.id);
        // Nowe wideo są w kolejce — zapamiętaj je w OSOBNYM polu queuedVideoIds,
        // żeby kolejny check nie dodawał ich ponownie (dedup) bez fałszywego
        // oznaczania jako „pobrane". downloadedVideoIds pozostaje wyłącznie dla
        // filmów, które faktycznie zakończyły pobieranie.
        await updateSubscription(filePath, sub.channelId, {
          ...basePatch,
          downloadPrefs: sub.downloadPrefs,
          autoDownload: sub.autoDownload,
          downloadedVideoIds: effectiveDownloaded,
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
      if (missingById.size > 0) missing.push(...missingById.values());
      checked++;
    } catch {
      errors++;
    }
  }
  logger.info(
    'subscriptions',
    `check done: checked=${checked} newVideos=${newVideos} queued=${queued} errors=${errors}`
  );
  return { checked, newVideos, queued, errors, ...(missing.length > 0 ? { missing } : {}) };
}

// Sprawdza pojedynczy kanał (przycisk "sprawdź teraz" per kanał) — z weryfikacją plików.
export async function checkSingleChannel(
  filePath: string,
  channelId: string
): Promise<IpcSubscriptionCheckResult> {
  return checkSubscriptions(filePath, channelId, true);
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
