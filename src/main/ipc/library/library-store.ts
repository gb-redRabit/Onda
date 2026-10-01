import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { MediaFile } from '../../../shared/types/media';
import { logger } from '../../../shared/logger';
import { getStore } from '../cover/cover-cache';

// Persistencja przeskanowanej biblioteki, trzymana POZA szyfrowanym electron-store:
// każdy zapis tam ponownie serializował + szyfrował AES całą listę (do 50 tys.
// plików) w wątku main. Ten moduł używa zwykłego pliku JSON z atomowymi
// zapisami i debounce/coalesce, więc serie (aktualizacje statystyk, pobrania) zlewają
// się w jeden zapis (plan 1.2).
export interface LibraryScannedData {
  files: MediaFile[];
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
}

const EMPTY: LibraryScannedData = { files: [], folderTypes: {} };

/**
 * Liczniki odtworzeń i daty ostatniego odtworzenia, w osobnym pliku.
 *
 * To jedyna część MediaFile, która zmienia się po skanowaniu, i jedyna,
 * która zmienia się często — kończący się utwór, ulubiony odtwarzany dwa razy.
 * Trzymanie ich w głównym pliku oznaczało, że każde odtworzenie serializowało całą
 * bibliotekę, więc kolekcja 50 tys. była przepisywana mniej więcej co półtorej sekundy przez
 * czas sesji słuchania. Tutaj zapis jest proporcjonalny do tego, co
 * faktycznie się zmieniło, a główny plik jest zapisywany tylko gdy skan go odbuduje.
 */
type StatsMap = Record<string, { playCount: number; lastPlayed: number }>;

let cache: LibraryScannedData | null = null;
let loadingPromise: Promise<LibraryScannedData | null> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let writing = false;
let dirty = false;
let statsTimer: ReturnType<typeof setTimeout> | null = null;
let statsWriting = false;
let statsDirty = false;
let stats: StatsMap = {};

function filePath(): string {
  return join(app.getPath('userData'), 'library-scanned.json');
}

function statsPath(): string {
  return join(app.getPath('userData'), 'library-stats.json');
}

async function readStats(): Promise<StatsMap> {
  try {
    const raw = await readFile(statsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as StatsMap;
  } catch {
    // jeszcze nie utworzono
  }
  return {};
}

/** Sidecar wygrywa: jest nowszy niż to, co uchwycił ostatni pełny zapis. */
function applyStats(data: LibraryScannedData): LibraryScannedData {
  for (const file of data.files) {
    const s = stats[file.path];
    if (!s) continue;
    if (typeof s.playCount === 'number') file.playCount = s.playCount;
    if (typeof s.lastPlayed === 'number') file.lastPlayed = s.lastPlayed;
  }
  return data;
}

async function readJson(): Promise<LibraryScannedData | null> {
  try {
    const raw = await readFile(filePath(), 'utf-8');
    const parsed = JSON.parse(raw) as LibraryScannedData;
    if (parsed && Array.isArray(parsed.files)) {
      return { files: parsed.files, folderTypes: parsed.folderTypes ?? {} };
    }
  } catch {
    // plik jeszcze nie utworzony (pierwsze uruchomienie)
  }
  return null;
}

// Jednorazowa migracja ze starego klucza szyfrowanego electron-store.
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
    // store niedostępny — nie ma czego migrować
  }
  return null;
}

export async function loadLibraryScanned(): Promise<LibraryScannedData | null> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    stats = await readStats();
    const fromFile = await readJson();
    cache = applyStats(fromFile ?? (await migrateFromStore()) ?? EMPTY);
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
  // Sidecar jest odbudowywany z nowego zbioru plików: musi pobrać liczniki dla
  // plików odtworzonych przez skan i usunąć ścieżki, które już nie istnieją, inaczej
  // rośnie przez całe życie profilu, a przeniesiony plik zachowuje starą historię.
  const next: StatsMap = {};
  for (const file of data.files) {
    if (typeof file.playCount === 'number' && file.playCount > 0) {
      next[file.path] = {
        playCount: file.playCount,
        lastPlayed: typeof file.lastPlayed === 'number' ? file.lastPlayed : 0
      };
    }
  }
  stats = next;
  scheduleStatsSave();
  scheduleLibraryScannedSave();
}

export function scheduleLibraryScannedSave(delay = 400): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushLibraryScanned();
  }, delay);
}

/**
 * Zapisuje liczniki odtworzeń dla kilku ścieżek i utrwala tylko je.
 *
 * Zwraca, czy cokolwiek się zmieniło, aby wywołujący, który już zaplanował pełny
 * zapis, nie zakolejkował drugiego dla tej samej serii.
 */
export function updateLibraryStats(
  updates: Array<{ path: string; playCount: number; lastPlayed: number }>
): boolean {
  if (!cache || updates.length === 0) return false;
  const byPath = new Map(updates.map((u) => [u.path, u]));
  let changed = false;
  for (const file of cache.files) {
    const u = byPath.get(file.path);
    if (!u) continue;
    file.playCount = u.playCount;
    if (typeof u.lastPlayed === 'number') file.lastPlayed = u.lastPlayed;
    stats[file.path] = { playCount: u.playCount, lastPlayed: u.lastPlayed };
    changed = true;
  }
  if (!changed) return false;
  scheduleStatsSave();
  return true;
}

function scheduleStatsSave(delay = 400): void {
  if (statsTimer) clearTimeout(statsTimer);
  statsTimer = setTimeout(() => {
    statsTimer = null;
    void flushStats();
  }, delay);
}

export async function flushStats(): Promise<void> {
  if (statsTimer) {
    clearTimeout(statsTimer);
    statsTimer = null;
  }
  if (statsWriting) {
    statsDirty = true;
    return;
  }
  statsWriting = true;
  try {
    do {
      statsDirty = false;
      const target = statsPath();
      const tmp = `${target}.tmp`;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(tmp, JSON.stringify(stats), 'utf-8');
      await rename(tmp, target);
    } while (statsDirty);
  } catch (e) {
    logger.warn('library', 'failed to persist library-stats.json', e);
  } finally {
    statsWriting = false;
  }
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
