import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join } from 'path';
import os from 'os';
import { app } from 'electron';
import { getStore } from './cover-store';

// Mapa cache okładek zapisywana we własnym pliku JSON (zamiast szyfrowanego
// electron-store), aby uniknąć przepisywania całej konfiguracji przy każdym zapisie okładki.
// Wyodrębnione z `cover-cache.ts` (plan 2.8).

export const COVER_CACHE_MAP_KEY = 'coverCacheMap';

let coverMapFile: string | null = null;
function getCoverMapFile(): string {
  if (!coverMapFile) {
    // `app.getPath` może zwrócić pusty string (nie tylko rzucić wyjątek), jeśli zostanie
    // wywołane przed gotowością aplikacji. `join('', name)` daje ścieżkę WZGLĘDNĄ, więc
    // mapa zostałaby zapisana w katalogu roboczym procesu — który dla
    // spakowanej aplikacji jest miejscem, z którego użytkownik ją uruchomił. Wszystko, co nie
    // jest ścieżką absolutną, jest traktowane jako niedostępne i spada do tmp.
    const userData = safeUserDataPath();
    coverMapFile = userData
      ? join(userData, 'cover-cache-map.json')
      : join(os.tmpdir(), 'onda', 'cover-cache-map.json');
  }
  return coverMapFile;
}

/** Katalog profilu lub null, gdy Electron nie może go jeszcze podać. */
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
    // Migracja z electron-store, jeśli plik jeszcze nie istnieje
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
      // migracja nie powiodła się — zaczynamy od nowa
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
    // Katalog nie jest tworzony przez nic innego na tej ścieżce: gdy
    // `app.getPath` jest niedostępne, mapa spada do podkatalogu tmp, który
    // istnieje tylko jeśli coś go wcześniej utworzyło, więc zapis kończył się ENOENT
    // i błąd był logowany przy każdym uruchomieniu testów dotykających cache okładek.
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data), 'utf-8');
    coverMapData = data;
  } finally {
    coverMapWriteLock = null;
    resolveLock!();
  }
}
