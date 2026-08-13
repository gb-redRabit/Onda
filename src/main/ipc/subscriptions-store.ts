import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../../shared/logger';
import type { Subscription } from '../../renderer/src/types/youtube';

export interface SubscriptionInput {
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  downloadPrefs?: Subscription['downloadPrefs'];
  seedBaseline?: boolean;
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
    | 'pendingCount'
    | 'newArrivals'
    | 'downloadPrefs'
  >
>;

let writeChain: Promise<void> = Promise.resolve();

// Serializes read-modify-write access to subscriptions.json. Without this,
// concurrent yt:subs:update calls (e.g. many finished downloads at once) race
// and silently lose downloadedVideoIds entries.
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn);
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

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

// Appends videoIds to a channel's downloadedVideoIds atomically. Used by the
// download manager so that no completed download is ever lost to a race.
export function appendDownloadedVideos(
  filePath: string,
  channelId: string,
  videoIds: string[]
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
    // A completed download is no longer „queued" — drop it from the queue set
    // so a future check never re-queues it and pendingCount counts it correctly.
    const queued = (list[idx].queuedVideoIds || []).filter((id) => !videoIds.includes(id));
    // A finished download means one fewer video left to fetch — keep the
    // "do pobrania" badge live in the UI instead of waiting for the next check.
    const prevPending = list[idx].pendingCount;
    const pendingCount = prevPending != null ? Math.max(0, prevPending - freshCount) : prevPending;
    list[idx] = {
      ...list[idx],
      downloadedVideoIds: [...known],
      queuedVideoIds: queued,
      pendingCount
    };
    await writeList(filePath, list);
    return list[idx];
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
