import { extname } from 'path';
import type { FSWatcher } from 'chokidar';
import { AUDIO_EXTS, VIDEO_EXTS, IMAGE_EXTS } from '../../shared/constants';
import { logger } from '../../shared/logger';

const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);
const DEBOUNCE_MS = 2000;

let watcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let scanCallback: (() => Promise<void>) | null = null;

export function setLibraryWatcherScan(cb: () => Promise<void>): void {
  scanCallback = cb;
}

// Watches library folders and triggers a debounced re-scan when media files
// are added, changed or removed. Uses chokidar (ESM-only) via dynamic import.
export async function startLibraryWatcher(folders: string[]): Promise<void> {
  stopLibraryWatcher();
  const clean = folders.filter((f): f is string => !!f && typeof f === 'string');
  if (clean.length === 0) return;
  try {
    const { watch } = await import('chokidar');
    watcher = watch(clean, {
      ignoreInitial: true,
      depth: 8,
      ignored: (path, stats) => {
        if (stats?.isDirectory()) return false;
        return !MEDIA_EXTS.has(extname(path).toLowerCase());
      },
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 }
    });

    const schedule = (): void => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void scanCallback?.();
      }, DEBOUNCE_MS);
    };

    watcher.on('add', schedule);
    watcher.on('change', schedule);
    watcher.on('unlink', schedule);
    watcher.on('error', (e) => logger.warn('library-watcher', 'watcher error', e));

    logger.info('library-watcher', `watching ${clean.length} folder(s)`);
  } catch (e) {
    logger.warn('library-watcher', 'failed to start watcher', e);
  }
}

export function stopLibraryWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}
