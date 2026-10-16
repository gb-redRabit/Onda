import { app } from 'electron';
import { join } from 'path';
import os from 'os';
import { logger } from '../../shared/logger';
import { applyCoverCacheSettings, getStore, initCoverCache } from '../ipc/cover/cover-cache';
import { setMainLocale } from '../i18n-main';
import {
  addAllowedRoot,
  getExtraRoots,
  setAllowedRoots,
  setRootsChangedHandler
} from '../media/media-server';
import { setAllowedRadioHostPredicate } from '../media/media-server-guards';
import { isAllowedRadioHost } from '../ipc/radio-store';
import { applyLogSettings } from '../log-file';
import { setCloseToTray } from '../windows/close-behavior';
import { setAutoLaunch } from '../windows/auto-launch';
import { asNonEmptyString, asPositiveNumber } from '../utils/store-guards';

/**
 * Zasiewa serwer mediów i stosuje utrwalone ustawienia przy starcie:
 * - rozmiar cache okładek (Ustawienia → Biblioteka),
 * - zapisane locale UI (napędza pozostałe komunikaty procesu głównego),
 * - korzenie biblioteki + utrwalone przyznane korzenie + domyślny katalog pobierania
 *   i katalogi transkodów (żeby świeże pobrania i stare media spoza biblioteki były
 *   serwowane od razu), z persystencją korzeni nadanych w czasie działania,
 * - ustawienia ogólne (close-to-tray, auto-uruchamianie, poziom/limit logów).
 *
 * Best-effort: awaria odczytu ustawień nie może zablokować startu (logowane, zwraca 0/0).
 */
export async function seedMediaServerAndSettings(): Promise<{ folders: number; roots: number }> {
  let bootFolders = 0;
  let bootRoots = 0;
  // Media server nie zna warstwy radia — wstrzykujemy predykat dozwolonego hosta
  // stacji (czyta żywy allowlist z `radio-store`, więc stacje dodane w trakcie
  // działania aplikacji są od razu odtwarzalne).
  setAllowedRadioHostPredicate(isAllowedRadioHost);
  try {
    const store = await getStore();
    // Rozmiar cache okładek z Ustawienia → Biblioteka. Wartości pochodzą z pliku
    // JSON na dysku, więc są walidowane, a nie rzutowane.
    const library = store.get('library') as Record<string, unknown> | undefined;
    applyCoverCacheSettings(asPositiveNumber(library?.coverCacheMaxEntries));
    await initCoverCache();
    // Zapisane locale UI napędza teraz pozostałe komunikaty procesu głównego.
    const appearance = store.get('appearance') as Record<string, unknown> | undefined;
    setMainLocale(asNonEmptyString(appearance?.locale));
    const folders = store.get('libraryFolders', []);
    bootFolders = Array.isArray(folders) ? folders.length : 0;
    if (Array.isArray(folders)) {
      await setAllowedRoots(folders);
    }
    // Utrwala korzenie przyznane w czasie działania (katalogi wyjściowe pobierania,
    // otwarte pliki), aby pobrane media pozostały odtwarzalne po restarcie.
    let rootsPersistTimer: ReturnType<typeof setTimeout> | null = null;
    setRootsChangedHandler(() => {
      if (rootsPersistTimer) return;
      rootsPersistTimer = setTimeout(() => {
        rootsPersistTimer = null;
        void store.set('mediaRoots', getExtraRoots().slice(0, 50));
      }, 500);
    });
    // Zasiewa wcześniej przyznane korzenie plus domyślny katalog pobierania, aby
    // świeże pobrania i stare spoza biblioteki były serwowane od razu.
    const storedRoots = store.get('mediaRoots', []);
    bootRoots = Array.isArray(storedRoots) ? storedRoots.length : 0;
    const seedRoots = new Set<string>([
      ...(Array.isArray(storedRoots) ? storedRoots : []),
      app.getPath('downloads'),
      // Transkodowane audio/wideo (fallback dla nieobsługiwanych kodeków) też
      // są serwowane przez media-server — katalogi muszą być w allowed roots.
      join(os.tmpdir(), 'onda', 'audio-transcodes'),
      join(os.tmpdir(), 'onda', 'video-transcodes')
    ]);
    for (const root of seedRoots) {
      await addAllowedRoot(root);
    }
    logger.info('boot', `settings: folders=${bootFolders} roots=${bootRoots}`);
    // Stosuje utrwalone ustawienia ogólne (close-to-tray + synchronizacja
    // auto-uruchamiania + poziom/limit logów z Ustawienia → System → Logi).
    const general = store.get('general') as
      | {
          autoLaunch?: boolean;
          startMinimized?: boolean;
          closeToTray?: boolean;
          logLevel?: string;
          logMaxSizeMB?: number;
        }
      | undefined;
    applyLogSettings(general?.logLevel, general?.logMaxSizeMB);
    if (general?.closeToTray !== undefined) setCloseToTray(general.closeToTray !== false);
    if (general?.autoLaunch !== undefined) {
      setAutoLaunch({ enabled: !!general.autoLaunch, hidden: !!general.startMinimized });
    }
  } catch (e) {
    logger.warn('main', 'seeding media server roots from library folders failed', e);
  }
  return { folders: bootFolders, roots: bootRoots };
}
