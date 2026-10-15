import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createWriteLock } from '../../utils/write-queue';
import type {
  ProviderRef,
  RemoteSubscription,
  RemoteSubscriptionInput,
  RemoteSubscriptionPatch
} from '../../../shared/types/providers';

// Trwały magazyn subskrypcji LINKÓW providerów (PikPak/MEGA/Drive/hostery) w JSON.
// Ładowany na starcie — brak re-fetchu. Zapis serializowany blokadą (jak subscriptions-store).

function isValid(sub: unknown): sub is RemoteSubscription {
  if (!sub || typeof sub !== 'object') return false;
  const s = sub as Record<string, unknown>;
  return typeof s.id === 'string' && typeof s.providerId === 'string' && typeof s.url === 'string';
}

export function sanitizeProviderRef(ref: unknown): ProviderRef | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as Record<string, unknown>;
  if (typeof r.provider !== 'string' || typeof r.shareId !== 'string') return null;
  return { provider: r.provider.slice(0, 50), shareId: r.shareId.slice(0, 2048) };
}

export async function loadRemoteSubscriptions(filePath: string): Promise<RemoteSubscription[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

const withLock = createWriteLock();

async function writeAll(filePath: string, subs: RemoteSubscription[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(subs, null, 2), 'utf-8');
  await rename(tmp, filePath);
}

export async function addRemoteSubscription(
  filePath: string,
  input: RemoteSubscriptionInput,
  providerId: string,
  ref: ProviderRef
): Promise<RemoteSubscription | null> {
  const cleanRef = sanitizeProviderRef(ref);
  if (!input?.url || typeof input.url !== 'string' || !providerId || !cleanRef) return null;
  return withLock(async () => {
    const subs = await loadRemoteSubscriptions(filePath);
    const existing = subs.find(
      (s) => s.providerId === providerId && s.ref.shareId === cleanRef.shareId
    );
    if (existing) return existing;
    const sub: RemoteSubscription = {
      id: randomUUID(),
      providerId,
      ref: cleanRef,
      url: input.url.slice(0, 2048),
      title: (input.title || input.url).slice(0, 300),
      addedAt: Date.now(),
      status: 'ok',
      downloadedItemIds: []
    };
    subs.push(sub);
    await writeAll(filePath, subs);
    return sub;
  });
}

export async function removeRemoteSubscription(filePath: string, id: string): Promise<boolean> {
  return withLock(async () => {
    const subs = await loadRemoteSubscriptions(filePath);
    const next = subs.filter((s) => s.id !== id);
    if (next.length === subs.length) return false;
    await writeAll(filePath, next);
    return true;
  });
}

export async function updateRemoteSubscription(
  filePath: string,
  id: string,
  patch: RemoteSubscriptionPatch
): Promise<RemoteSubscription | null> {
  return withLock(async () => {
    const subs = await loadRemoteSubscriptions(filePath);
    const sub = subs.find((s) => s.id === id);
    if (!sub) return null;
    if (typeof patch.title === 'string') sub.title = patch.title.slice(0, 300);
    if (patch.status) sub.status = patch.status;
    if (typeof patch.lastCheckedAt === 'number') sub.lastCheckedAt = patch.lastCheckedAt;
    if (typeof patch.url === 'string' && patch.url.trim())
      sub.url = patch.url.trim().slice(0, 2048);
    if (patch.ref) {
      const cleanRef = sanitizeProviderRef(patch.ref);
      if (cleanRef) sub.ref = cleanRef;
    }
    if (Array.isArray(patch.downloadedItemIds)) {
      sub.downloadedItemIds = Array.from(
        new Set([
          ...(sub.downloadedItemIds || []),
          ...patch.downloadedItemIds.filter((x) => typeof x === 'string')
        ])
      );
    }
    if (Array.isArray(patch.seenItemIds)) {
      sub.seenItemIds = patch.seenItemIds.filter((x): x is string => typeof x === 'string');
    }
    if (typeof patch.newCount === 'number') sub.newCount = Math.max(0, patch.newCount);
    await writeAll(filePath, subs);
    return sub;
  });
}
