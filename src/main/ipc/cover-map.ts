import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import { app } from 'electron';
import { getStore } from './cover-store';

// Cover cache map persisted to its own JSON file (instead of the encrypted
// electron-store) to avoid rewriting the entire config on every cover save.
// Split out of `cover-cache.ts` (plan 2.8).

export const COVER_CACHE_MAP_KEY = 'coverCacheMap';

let coverMapFile: string | null = null;
function getCoverMapFile(): string {
  if (!coverMapFile) {
    try {
      coverMapFile = join(app.getPath('userData'), 'cover-cache-map.json');
    } catch {
      coverMapFile = join(os.tmpdir(), 'onda', 'cover-cache-map.json');
    }
  }
  return coverMapFile;
}

let coverMapData: Record<string, { cacheFile: string; mtime: number }> | null = null;
let coverMapWriteLock: Promise<void> | null = null;

export async function readCoverMap(): Promise<
  Record<string, { cacheFile: string; mtime: number }>
> {
  if (coverMapData) return coverMapData;
  try {
    const raw = await readFile(getCoverMapFile(), 'utf-8');
    coverMapData = JSON.parse(raw);
  } catch {
    coverMapData = {};
    // Migrate from electron-store if the file doesn't exist yet
    try {
      const store = await getStore();
      const legacy = store.get(COVER_CACHE_MAP_KEY) as
        Record<string, { cacheFile: string; mtime: number }> | undefined;
      if (legacy && Object.keys(legacy).length > 0) {
        coverMapData = legacy;
        await writeCoverMap(coverMapData);
        store.set(COVER_CACHE_MAP_KEY, undefined);
      }
    } catch {
      // migration failed — start fresh
    }
  }
  return coverMapData!;
}

export async function writeCoverMap(
  data: Record<string, { cacheFile: string; mtime: number }>
): Promise<void> {
  while (coverMapWriteLock) await coverMapWriteLock;
  let resolveLock: () => void;
  coverMapWriteLock = new Promise((r) => {
    resolveLock = r;
  });
  try {
    await writeFile(getCoverMapFile(), JSON.stringify(data), 'utf-8');
    coverMapData = data;
  } finally {
    coverMapWriteLock = null;
    resolveLock!();
  }
}
