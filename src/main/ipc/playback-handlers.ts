import { ipcMain } from 'electron';
import { stat } from 'fs/promises';
import { getStore } from './cover/cover-cache';
import { logger } from '../../shared/logger';

const PLAYBACK_KEY = 'playbackPositions';
const MAX_ENTRIES = 500;
// Zapis pozycji jest debounce'owany: `timeupdate` renderera woła setPosition co ~3 s,
// a każdy zapis to serializacja całego JSON electron-store. Scalanie do jednego zapisu
// na okno znacznie zmniejsza I/O przy długich sesjach.
const PERSIST_DEBOUNCE_MS = 15_000;

const playbackPositions = new Map<string, number>();

// Zmiany oczekujące na zapis (position === null = usunięcie wpisu), kluczowane ścieżką.
const pendingWrites = new Map<string, number | null>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();

function capAndTrim(all: Record<string, number>): void {
  // Utrzymuje store w ograniczeniu — usuwa najstarsze wpisy ponad limit.
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[k];
  }
}

async function writePending(): Promise<void> {
  const batch = [...pendingWrites.entries()];
  pendingWrites.clear();
  if (batch.length === 0) return;
  try {
    const store = await getStore();
    const all = (store.get(PLAYBACK_KEY) as Record<string, number> | undefined) || {};
    for (const [filePath, position] of batch) {
      if (position === null) delete all[filePath];
      else all[filePath] = position;
    }
    capAndTrim(all);
    store.set(PLAYBACK_KEY, all);
  } catch (e) {
    // Nie trać zmian — wróć do kolejki, aby kolejny flush spróbował ponownie.
    for (const [filePath, position] of batch) {
      if (!pendingWrites.has(filePath)) pendingWrites.set(filePath, position);
    }
    logger.warn('playback', 'persist position failed', e);
  }
}

function schedulePersist(filePath: string, position: number | null): void {
  pendingWrites.set(filePath, position);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, PERSIST_DEBOUNCE_MS);
}

/** Opróżnia oczekujące zapisy (debounce), serializując równoległe wywołania. */
async function flushPending(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushChain = flushChain.then(() => writePending());
  return flushChain;
}

/** Opróżnia oczekujące zapisy pozycji odtwarzania — wołane przy zamykaniu aplikacji. */
export async function flushPlaybackPositions(): Promise<void> {
  await flushPending();
}

export function registerPlaybackHandlers(): void {
  ipcMain.handle('playback:getPosition', async (_event, filePath: string): Promise<number> => {
    try {
      if (playbackPositions.has(filePath)) return playbackPositions.get(filePath) || 0;
      const store = await getStore();
      const all = (store.get(PLAYBACK_KEY) as Record<string, number> | undefined) || {};
      const pos = all[filePath];
      if (typeof pos === 'number' && pos > 0) {
        playbackPositions.set(filePath, pos);
        return pos;
      }
      // Leniwie usuwa wpisy wskazujące na pliki, które już nie istnieją.
      if (filePath && all[filePath] !== undefined) {
        const exists = await stat(filePath).catch(() => null);
        if (!exists) {
          delete all[filePath];
          store.set(PLAYBACK_KEY, all);
        }
      }
      return 0;
    } catch (e) {
      logger.warn('playback', 'getPosition failed', e);
      return 0;
    }
  });

  ipcMain.handle(
    'playback:setPosition',
    async (_event, filePath: string, position: number): Promise<void> => {
      try {
        if (typeof position === 'number' && position > 0) {
          playbackPositions.set(filePath, position);
          schedulePersist(filePath, position);
        } else {
          playbackPositions.delete(filePath);
          schedulePersist(filePath, null);
        }
      } catch (e) {
        logger.warn('playback', 'setPosition failed', e);
      }
    }
  );

  ipcMain.handle('playback:clearPosition', async (_event, filePath: string): Promise<void> => {
    try {
      playbackPositions.delete(filePath);
      pendingWrites.set(filePath, null);
      // Czyszczenie jest trwałe od razu — inaczej wznowienie mogłoby wskrzesić
      // pozycję usuniętego/zmienionego utworu.
      await flushPending();
    } catch (e) {
      logger.warn('playback', 'clearPosition failed', e);
    }
  });
}
