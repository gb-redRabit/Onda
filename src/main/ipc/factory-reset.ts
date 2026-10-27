import { app, ipcMain, session } from 'electron';
import type { AppFactoryResetResult } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';
import { getStore } from './cover/cover-store';
import { clearAppCaches } from './app-cache';
import { clearLogFile } from '../log-file';
import { AUTH_PARTITION } from '../youtube/youtube-auth-session';
import { providerLoginPartitions } from './providers/provider-login';
import { PREVIEW_PARTITION } from '../preview/preview-session';
import { removeProfileState } from '../utils/profile-state';
import { CURRENT_STORE_VERSION, MAX_STORE_BACKUPS, STORE_VERSION_KEY } from '../state-migrations';
import { relaunchApp } from '../bootstrap/relaunch';

// Factory reset: usuwa cały stan użytkownika/aplikacji i restartuje aplikację. Zachowane
// celowo: `bin/` (zarządzane ffmpeg/yt-dlp — narzędzia do ponownego pobrania, decyzja
// użytkownika 2026-09-15), `onda-store-key` (klucz szyfrowania na instalację) oraz
// katalogi należące do Chromium (czyszczone przez API sesji, nie ręcznie).

export const FACTORY_RESET_RESTART_DELAY_MS = 800;

let resetting = false;

/** True od rozpoczęcia factory reset do momentu restartu procesu. */
export function isResetting(): boolean {
  return resetting;
}

function storeBackupFiles(): string[] {
  return Array.from({ length: MAX_STORE_BACKUPS }, (_, i) => `config.json.bak.${i + 1}`);
}

// Czyści cookies, localStorage (flagę pierwszego uruchomienia) i cache HTTP zarówno
// dla sesji głównej, jak i odizolowanej partycji uwierzytelniania YouTube.
async function clearSessionStorages(): Promise<void> {
  const sessions: Array<[string, Electron.Session]> = [
    ['default', session.defaultSession],
    ['youtube-auth', session.fromPartition(AUTH_PARTITION)],
    ...providerLoginPartitions().map((p): [string, Electron.Session] => [
      p,
      session.fromPartition(p)
    ]),
    ['onda-preview', session.fromPartition(PREVIEW_PARTITION)]
  ];
  for (const [label, ses] of sessions) {
    try {
      await ses.clearStorageData();
      await ses.clearCache();
    } catch (e) {
      logger.warn('reset', `factory reset could not clear the ${label} session`, e);
    }
  }
}

export async function factoryReset(): Promise<AppFactoryResetResult> {
  if (resetting) return { success: false, error: 'reset already in progress' };
  resetting = true;
  try {
    // Świeży store w bieżącej wersji schematu — sam plik konfiguracji zostaje,
    // aby następny start nie uruchamiał tańca kopii/migracji na pustym pliku.
    const store = await getStore();
    store.clear();
    store.set(STORE_VERSION_KEY, CURRENT_STORE_VERSION);

    await clearAppCaches();
    const failed = await removeProfileState(app.getPath('userData'), storeBackupFiles());
    await clearLogFile();
    await clearSessionStorages();

    logger.info('reset', `factory reset complete (${failed.length} locked entries kept)`);

    // Buildy dev są obsługiwane przez serwer dev/preview electron-vite, który wyłącza
    // się, gdy tylko ten proces Electron zakończy działanie. Zwykłe `app.relaunch()`
    // uruchomiłoby się wtedy przeciw martwemu URL (ERR_CONNECTION_REFUSED -> puste okno),
    // więc w dev restartujemy polecenie dev: nowy serwer, nowy proces aplikacji, ten sam
    // profil. `ELECTRON_RENDERER_URL` oznacza "uruchomione przez electron-vite"; bez
    // niego (np. `electron .`, Playwright) nie ma czego restartować — po prostu kończymy.
    // (Logowane przed opóźnieniem, bo `app.exit` pomija flush wszystkiego, co zostało
    // zalogowane tuż przed nim.)
    if (!app.isPackaged) {
      logger.info(
        'reset',
        process.env['ELECTRON_RENDERER_URL']
          ? 'dev build — restarting the dev command'
          : 'dev build without a dev server — exiting (start the app again)'
      );
    } else {
      logger.info('reset', 'packaged build — relaunching with a clean process');
    }
    // `app.exit` celowo pomija flush przy zamykaniu, więc debounced writery nie mogą
    // wskrzesić stanu, który właśnie usunięto.
    relaunchApp(FACTORY_RESET_RESTART_DELAY_MS);
    return { success: true };
  } catch (e) {
    resetting = false;
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('reset', 'factory reset failed', e);
    return { success: false, error: msg };
  }
}

export function registerFactoryResetHandler(): void {
  ipcMain.handle('app:factoryReset', () => factoryReset());
}
