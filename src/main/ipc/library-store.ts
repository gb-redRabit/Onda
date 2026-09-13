import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { MediaFile } from '../../renderer/src/types/media';
import { logger } from '../../shared/logger';
import { getStore } from './cover-cache';

// Persistence for the scanned library, kept OUT of the encrypted electron-store:
// every save there re-serialised + AES-encrypted the whole list (up to 50k
// files) on the main thread. This module uses a plain JSON file with atomic
// writes and a debounce/coalesce, so bursts (stats updates, downloads) collapse
// into a single write (plan 1.2).
export interface LibraryScannedData {
  files: MediaFile[];
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
}

const EMPTY: LibraryScannedData = { files: [], folderTypes: {} };

let cache: LibraryScannedData | null = null;
let loadingPromise: Promise<LibraryScannedData | null> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let dirty = false;

function filePath(): string {
  return join(app.getPath('userData'), 'library-scanned.json');
}

async function readJson(): Promise<LibraryScannedData | null> {
  try {
    const raw = await readFile(filePath(), 'utf-8');
    const parsed = JSON.parse(raw) as LibraryScannedData;
    if (parsed && Array.isArray(parsed.files)) {
      return { files: parsed.files, folderTypes: parsed.folderTypes ?? {} };
    }
  } catch {
    // file not created yet (first run)
  }
  return null;
}

// One-time migration from the legacy encrypted electron-store key.
async function migrateFromStore(): Promise<LibraryScannedData | null> {
  try {
    const store = await getStore();
    const legacy = store.get('libraryScanned', null) as LibraryScannedData | null;
    if (legacy && Array.isArray(legacy.files)) {
      const data: LibraryScannedData = {
        files: legacy.files,
        folderTypes: legacy.folderTypes ?? {}
      };
      store.delete('libraryScanned');
      cache = data;
      scheduleLibraryScannedSave(0);
      logger.info(
        'library',
        `migrated libraryScanned from electron-store (${data.files.length} files)`
      );
      return data;
    }
  } catch {
    // store unavailable — nothing to migrate
  }
  return null;
}

export async function loadLibraryScanned(): Promise<LibraryScannedData | null> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const fromFile = await readJson();
    cache = fromFile ?? (await migrateFromStore());
    loadingPromise = null;
    return cache;
  })();
  return loadingPromise;
}

export function getLibraryScanned(): LibraryScannedData {
  return cache ?? EMPTY;
}

export function setLibraryScanned(data: LibraryScannedData): void {
  cache = data;
  scheduleLibraryScannedSave();
}

export function scheduleLibraryScannedSave(delay = 400): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushLibraryScanned();
  }, delay);
}

async function writeNow(): Promise<void> {
  const data = cache;
  if (!data) return;
  const target = filePath();
  const tmp = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(tmp, JSON.stringify(data), 'utf-8');
  await rename(tmp, target);
}

export async function flushLibraryScanned(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (writing) {
    dirty = true;
    return;
  }
  writing = true;
  try {
    do {
      dirty = false;
      await writeNow();
    } while (dirty);
  } catch (e) {
    logger.warn('library', 'failed to persist library-scanned.json', e);
  } finally {
    writing = false;
  }
}
