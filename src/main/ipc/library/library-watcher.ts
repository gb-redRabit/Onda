import { extname } from 'path';
import type { FSWatcher } from 'chokidar';
import { AUDIO_EXTS, VIDEO_EXTS, IMAGE_EXTS } from '../../../shared/constants';
import { logger } from '../../../shared/logger';

const MEDIA_EXTS = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);
const DEBOUNCE_MS = 2000;

let watcher: FSWatcher | null = null;
let watched: string[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let scanCallback: (() => Promise<void>) | null = null;
let starting: Promise<void> | null = null;
// Bumped on every stop. A start whose dynamic import resolves after a stop sees
// a stale generation and discards the watcher it just created instead of
// leaking a handle nothing can close.
let generation = 0;

export function setLibraryWatcherScan(cb: () => Promise<void>): void {
  scanCallback = cb;
}

function sameFolders(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((folder, i) => folder === right[i]);
}

/**
 * Watches library folders and triggers a debounced re-scan when media files
 * are added, changed or removed. Uses chokidar (ESM-only) via dynamic import.
 *
 * Calling this with the folders that are already watched is a no-op. It used to
 * stop and recreate the watcher every time, and the caller is the download
 * completion path — so a batch of downloads left a gap where nothing was being
 * watched, and each teardown closed handles the next start had to re-open.
 */
export async function startLibraryWatcher(folders: string[]): Promise<void> {
  const clean = folders.filter((f): f is string => !!f && typeof f === 'string');
  if (clean.length === 0) {
    stopLibraryWatcher();
    return;
  }
  // Serialise concurrent starts: a folder switch calls this twice, and both
  // would otherwise race to create a watcher, leaking the first one.
  if (starting) await starting.catch(() => {});
  if (watcher && sameFolders(watched, clean)) return;

  stopLibraryWatcher();
  const myGeneration = generation;
  watched = clean;
  starting = (async () => {
    try {
      const { watch } = await import('chokidar');

      // A stop/restart may have run while the dynamic import was pending.
      if (myGeneration !== generation || !sameFolders(watched, clean)) return;

      const next = watch(clean, {
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

      next.on('add', schedule);
      next.on('change', schedule);
      next.on('unlink', schedule);
      next.on('error', (e) => logger.warn('library-watcher', 'watcher error', e));

      watcher = next;
      logger.info('library-watcher', `watching ${clean.length} folder(s)`);
    } catch (e) {
      logger.warn('library-watcher', 'failed to start watcher', e);
    } finally {
      starting = null;
    }
  })();
  await starting;
}

function stopLibraryWatcher(): void {
  generation += 1;
  watched = [];
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}
