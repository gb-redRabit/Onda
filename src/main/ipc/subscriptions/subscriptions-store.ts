import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../../../shared/logger';
import type { Subscription } from '../../../shared/types/online';
import { createWriteLock } from '../../utils/write-queue';

export interface SubscriptionInput {
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  downloadPrefs?: Subscription['downloadPrefs'];
  seedBaseline?: boolean;
  // Domyślnie 'youtube' — subskrypcje SoundCloud niosą 'soundcloud' i używają
  // permalinków profilu jako channelId.
  platform?: 'youtube' | 'soundcloud';
}

export type SubscriptionPatch = Partial<
  Pick<
    Subscription,
    | 'autoDownload'
    | 'channelTitle'
    | 'channelThumbnail'
    | 'lastChecked'
    | 'lastVideoId'
    | 'baselineVideoId'
    | 'downloadedVideoIds'
    | 'queuedVideoIds'
    | 'downloadedFiles'
    | 'pendingCount'
    | 'newArrivals'
    | 'downloadPrefs'
  >
>;

// Serializuje dostęp read-modify-write do subscriptions.json. Bez tego
// równoczesne wywołania yt:subs:update (np. wiele ukończonych pobrań naraz) ścigają się
// i po cichu gubią wpisy downloadedVideoIds.
const withWriteLock = createWriteLock();

async function readList(filePath: string): Promise<Subscription[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is Subscription => !!s && typeof s === 'object' && typeof s.channelId === 'string'
    );
  } catch {
    return [];
  }
}

async function writeList(filePath: string, list: Subscription[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

export async function loadSubscriptions(filePath: string): Promise<Subscription[]> {
  return readList(filePath);
}

// Atomowo dopisuje videoIds do downloadedVideoIds kanału. Używane przez
// menedżera pobierania, aby żadne ukończone pobranie nigdy nie przepadło przez wyścig.
// `files` (opcjonalnie) mapuje videoId → ścieżka pliku, żeby późniejsze ręczne
// „sprawdź teraz" mogło zweryfikować, czy plik nadal istnieje na dysku.
export function appendDownloadedVideos(
  filePath: string,
  channelId: string,
  videoIds: string[],
  files?: Record<string, string>
): Promise<Subscription | null> {
  return withWriteLock(async () => {
    const list = await readList(filePath);
    const idx = list.findIndex((s) => s.channelId === channelId);
    if (idx === -1) return null;
    const known = new Set(list[idx].downloadedVideoIds || []);
    const freshCount = videoIds.filter((id) => id && !known.has(id)).length;
    for (const id of videoIds) {
      if (id) known.add(id);
    }
    // Ukończone pobranie nie jest już "w kolejce" — usuń je ze zbioru kolejki,
    // aby przyszłe sprawdzenie nigdy nie zakolejkowało go ponownie i pendingCount liczył je poprawnie.
    const queued = (list[idx].queuedVideoIds || []).filter((id) => !videoIds.includes(id));
    // Zakończone pobranie oznacza o jeden film mniej do pobrania — utrzymuj
    // odznakę "do pobrania" na bieżąco w UI, zamiast czekać na następne sprawdzenie.
    const prevPending = list[idx].pendingCount;
    const pendingCount = prevPending != null ? Math.max(0, prevPending - freshCount) : prevPending;
    const nextFiles: Record<string, string> = { ...(list[idx].downloadedFiles || {}) };
    if (files) {
      for (const [id, p] of Object.entries(files)) {
        if (id && typeof p === 'string' && p) nextFiles[id] = p;
      }
    }
    list[idx] = {
      ...list[idx],
      downloadedVideoIds: [...known],
      queuedVideoIds: queued,
      downloadedFiles: nextFiles,
      pendingCount
    };
    await writeList(filePath, list);
    return list[idx];
  });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Weryfikuje zapisane ścieżki pobranych filmów kanału: wpisy, których plik zniknął
 * z dysku, są usuwane z `downloadedVideoIds` i `downloadedFiles`. Zwraca usunięte id,
 * żeby wywołujący mógł zdecydować o ponownym zakolejkowaniu (świadomie NIE robimy tego
 * w tym samym przebiegu — film staje się „nowy" dopiero przy następnym sprawdzeniu).
 */
export function reconcileDownloadedFiles(
  filePath: string,
  channelId: string
): Promise<{ updated: Subscription | null; removedIds: string[] }> {
  return withWriteLock(async () => {
    const list = await readList(filePath);
    const idx = list.findIndex((s) => s.channelId === channelId);
    if (idx === -1) return { updated: null, removedIds: [] };
    const files = list[idx].downloadedFiles || {};
    const entries = Object.entries(files);
    if (entries.length === 0) return { updated: list[idx], removedIds: [] };
    const missing: string[] = [];
    await Promise.all(
      entries.map(async ([id, p]) => {
        if (!(await fileExists(p))) missing.push(id);
      })
    );
    if (missing.length === 0) return { updated: list[idx], removedIds: [] };
    const missingSet = new Set(missing);
    const nextFiles: Record<string, string> = {};
    for (const [id, p] of entries) {
      if (!missingSet.has(id)) nextFiles[id] = p;
    }
    const nextDownloaded = (list[idx].downloadedVideoIds || []).filter((id) => !missingSet.has(id));
    list[idx] = { ...list[idx], downloadedVideoIds: nextDownloaded, downloadedFiles: nextFiles };
    await writeList(filePath, list);
    logger.info(
      'subscriptions',
      `reconcile ${channelId}: unmarked ${missing.length} missing file(s)`
    );
    return { updated: list[idx], removedIds: missing };
  });
}

export function addSubscription(
  filePath: string,
  input: SubscriptionInput
): Promise<Subscription | null> {
  return withWriteLock(async () => {
    if (!input || typeof input.channelId !== 'string' || !input.channelId.trim()) {
      logger.warn('subscriptions', 'addSubscription: missing channelId');
      return null;
    }
    const list = await readList(filePath);
    const existing = list.find((s) => s.channelId === input.channelId);
    if (existing) return existing;
    const sub: Subscription = {
      id: input.channelId,
      channelId: input.channelId,
      channelTitle: input.channelTitle || input.channelId,
      channelThumbnail: input.channelThumbnail || '',
      autoDownload: true,
      platform: input.platform === 'soundcloud' ? 'soundcloud' : 'youtube',
      downloadedVideoIds: [],
      downloadPrefs: input.downloadPrefs,
      addedAt: Date.now()
    };
    list.push(sub);
    await writeList(filePath, list);
    return sub;
  });
}

export function removeSubscription(filePath: string, channelId: string): Promise<boolean> {
  return withWriteLock(async () => {
    const list = await readList(filePath);
    const next = list.filter((s) => s.channelId !== channelId);
    if (next.length === list.length) return false;
    await writeList(filePath, next);
    return true;
  });
}

export function updateSubscription(
  filePath: string,
  channelId: string,
  patch: SubscriptionPatch
): Promise<Subscription | null> {
  return withWriteLock(async () => {
    const list = await readList(filePath);
    const idx = list.findIndex((s) => s.channelId === channelId);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    await writeList(filePath, list);
    return list[idx];
  });
}
