import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createWriteLock } from '../../utils/write-queue';

// Trwały magazyn oznaczonych jako pobrane elementów providerów (PikPak/MEGA/Drive…).
// Klucz: `${provider}:${shareId}` → lista id elementów. Zapis serializowany blokadą.

interface DownloadedMap {
  [key: string]: string[];
}

function keyOf(provider: string, shareId: string): string {
  return `${provider}:${shareId}`;
}

async function readAll(filePath: string): Promise<DownloadedMap> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DownloadedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

const withLock = createWriteLock();

async function writeAll(filePath: string, map: DownloadedMap): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(map, null, 2), 'utf-8');
  await rename(tmp, filePath);
}

export async function loadProviderDownloaded(
  filePath: string,
  provider: string,
  shareId: string
): Promise<string[]> {
  const map = await readAll(filePath);
  return map[keyOf(provider, shareId)] || [];
}

export async function markProviderDownloaded(
  filePath: string,
  provider: string,
  shareId: string,
  itemIds: string[]
): Promise<string[]> {
  if (!provider || !shareId || !Array.isArray(itemIds) || itemIds.length === 0) {
    return loadProviderDownloaded(filePath, provider, shareId);
  }
  return withLock(async () => {
    const map = await readAll(filePath);
    const key = keyOf(provider, shareId);
    const set = new Set(map[key] || []);
    for (const id of itemIds) if (typeof id === 'string' && id) set.add(id);
    map[key] = Array.from(set);
    await writeAll(filePath, map);
    return map[key];
  });
}
