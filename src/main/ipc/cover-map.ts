import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join } from 'path';
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
    // `app.getPath` can return an empty string (not only throw) if it is called
    // before the app is ready. `join('', name)` yields a RELATIVE path, so the
    // map would then be written into the process working directory — which for
    // a packaged app is wherever the user launched it from. Anything that is
    // not an absolute path is treated as unavailable and falls back to tmp.
    const userData = safeUserDataPath();
    coverMapFile = userData
      ? join(userData, 'cover-cache-map.json')
      : join(os.tmpdir(), 'onda', 'cover-cache-map.json');
  }
  return coverMapFile;
}

/** The profile directory, or null when Electron cannot provide one yet. */
function safeUserDataPath(): string | null {
  try {
    const dir = app.getPath('userData');
    return dir && isAbsolute(dir) ? dir : null;
  } catch {
    return null;
  }
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
    const file = getCoverMapFile();
    // The directory is not created by anything else on this path: when
    // `app.getPath` is unavailable the map falls back to a tmp subdirectory that
    // exists only if something made it first, so the write failed with ENOENT
    // and the failure was logged on every test run that touched the cover cache.
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf-8');
    coverMapData = data;
  } finally {
    coverMapWriteLock = null;
    resolveLock!();
  }
}
