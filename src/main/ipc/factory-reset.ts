import { app, ipcMain, session } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { AppFactoryResetResult } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';
import { getStore } from './cover/cover-store';
import { clearAppCaches } from './app-cache';
import { clearLogFile, getLogDir } from '../log-file';
import { AUTH_PARTITION } from '../youtube/youtube-auth-session';
import { removeProfileState } from '../utils/profile-state';
import { CURRENT_STORE_VERSION, MAX_STORE_BACKUPS, STORE_VERSION_KEY } from '../state-migrations';

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

// Restartuje polecenie dev electron-vite dla factory reset w trybie dev.
//
// Dlaczego nie `npm run dev`: w Windows `shell: true` uruchamia cmd.exe z własną
// konsolą, której `windowsHide` nie ukrywa dla odłączonego shella — użytkownik
// zobaczył obce okno cmd. Uruchomienie binarki electron-vite zwykłym Node
// utrzymuje spawn bezokienkowym (zmierzone: `MainWindowHandle = 0`, brak nowego conhost).
//
// `detached: true` jest wymagane na każdej platformie, w tym Windows: zwykłe dziecko
// jest kończone razem z tym procesem (zmierzone), więc restartowany stos ginął
// w trakcie budowania i aplikacja nie wracała. Odłączenie pozwala mu przetrwać `app.exit(0)`
// i trzyma go poza grupą procesów rodzica (Ctrl+C w terminalu, który uruchomił
// Ondę, nie może zabić świeżego serwera dev).
//
// Binarka Node pochodzi z `npm_node_execpath` (ustawiane, gdy Onda została uruchomiona
// przez skrypt npm), a `node` ze PATH jest fallbackiem. NIE uruchamiaj tutaj
// binarki Electron z `ELECTRON_RUN_AS_NODE=1` dla całego poddrzewa:
// electron-vite uruchamia aplikację z `{ stdio: 'inherit' }` i bez `env`, więc
// flaga wyciekłaby do nowego procesu Electron i wstałby on headless jako
// zwykły Node (brak okna, brak logów).
function restartDevCommand(): void {
  const node = process.env['npm_node_execpath'] || 'node';
  const bin = join(app.getAppPath(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  // Restartowany stos nie ma podłączonego terminala, więc zapisujemy jego wyjście na dysk —
  // inaczej nieudany restart jest niewidoczny (aplikacja po prostu nie wraca).
  mkdirSync(getLogDir(), { recursive: true });
  const out = openSync(join(getLogDir(), 'dev-restart.log'), 'a');
  const child = spawn(node, [bin, 'dev'], {
    cwd: app.getAppPath(),
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  child.unref();
}

// Czyści cookies, localStorage (flagę pierwszego uruchomienia) i cache HTTP zarówno
// dla sesji głównej, jak i odizolowanej partycji uwierzytelniania YouTube.
async function clearSessionStorages(): Promise<void> {
  const sessions: Array<[string, Electron.Session]> = [
    ['default', session.defaultSession],
    ['youtube-auth', session.fromPartition(AUTH_PARTITION)]
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
      if (process.env['ELECTRON_RENDERER_URL']) {
        logger.info('reset', 'dev build — restarting the dev command');
        try {
          restartDevCommand();
        } catch (e) {
          logger.warn('reset', 'could not restart the dev command — start it manually', e);
        }
      } else {
        logger.info('reset', 'dev build without a dev server — exiting (start the app again)');
      }
      setTimeout(() => app.exit(0), FACTORY_RESET_RESTART_DELAY_MS);
      return { success: true };
    }

    // Dajemy rendererowi chwilę na pokazanie stanu "restartowanie", potem restart
    // z czystym procesem. `app.exit` celowo pomija flush przy zamykaniu, więc
    // debounced writery nie mogą wskrzesić stanu, który właśnie usunięto.
    setTimeout(() => {
      app.relaunch();
      try {
        app.exit(0);
      } catch (e) {
        // Handler `closed` okna rzucił wyjątek, gdy Electron zamykał okna
        // (guardy wysyłki powinny temu zapobiec) — ponawiamy, aby relaunch się odbył.
        logger.warn('reset', 'app.exit threw during reset — retrying', e);
        setTimeout(() => app.exit(0), 200);
      }
    }, FACTORY_RESET_RESTART_DELAY_MS);
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
