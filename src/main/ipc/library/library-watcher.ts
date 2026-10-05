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
// Zwiększane przy każdym zatrzymaniu. Start, którego dynamiczny import rozwiąże się po zatrzymaniu,
// widzi nieaktualną generację i odrzuca właśnie utworzony watcher, zamiast
// wyciekać uchwyt, którego nic nie może zamknąć.
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
 * Obserwuje foldery biblioteki i wyzwala debounce'owane ponowne skanowanie, gdy pliki mediów
 * zostaną dodane, zmienione lub usunięte. Używa chokidar (tylko ESM) przez dynamiczny import.
 *
 * Wywołanie tego z folderami już obserwowanymi jest no-opem. Kiedyś zatrzymywało
 * i odtwarzało watcher za każdym razem, a wywołującym jest ścieżka ukończenia
 * pobierania — więc seria pobrań zostawiała lukę, w której nic nie było
 * obserwowane, a każde zamknięcie zamykało uchwyty, które następny start musiał otworzyć ponownie.
 */
export async function startLibraryWatcher(folders: string[]): Promise<void> {
  const clean = folders.filter((f): f is string => !!f && typeof f === 'string');
  if (clean.length === 0) {
    stopLibraryWatcher();
    return;
  }
  // Serializuj równoczesne starty: zmiana folderu wywołuje to dwa razy i oba
  // wyścigowo tworzyłyby watcher, wyciekając pierwszy.
  if (starting)
    await starting.catch(() => {
      /* best-effort */
    });
  if (watcher && sameFolders(watched, clean)) return;

  stopLibraryWatcher();
  const myGeneration = generation;
  watched = clean;
  starting = (async () => {
    try {
      const { watch } = await import('chokidar');

      // Zatrzymanie/restart mogło wykonać się, gdy dynamiczny import był w toku.
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
