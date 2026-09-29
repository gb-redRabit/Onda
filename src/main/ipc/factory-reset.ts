import { app, ipcMain, session } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { AppFactoryResetResult } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';
import { getStore } from './cover-store';
import { clearAppCaches } from './app-cache';
import { clearLogFile, getLogDir } from '../log-file';
import { AUTH_PARTITION } from '../youtube-auth-session';
import { removeProfileState } from '../utils/profile-state';
import { CURRENT_STORE_VERSION, MAX_STORE_BACKUPS, STORE_VERSION_KEY } from '../state-migrations';

// Factory reset: wipes all user/app state and restarts the app. Kept on
// purpose: `bin/` (managed ffmpeg/yt-dlp — re-downloadable tooling, user
// decision 2026-09-15), `onda-store-key` (per-install encryption key) and the
// Chromium-owned directories (cleared through the session APIs, not by hand).

export const FACTORY_RESET_RESTART_DELAY_MS = 800;

let resetting = false;

/** True from the moment a factory reset starts until the process restarts. */
export function isResetting(): boolean {
  return resetting;
}

function storeBackupFiles(): string[] {
  return Array.from({ length: MAX_STORE_BACKUPS }, (_, i) => `config.json.bak.${i + 1}`);
}

// Restarts the electron-vite dev command for a factory reset in dev.
//
// Why not `npm run dev`: on Windows `shell: true` spawns cmd.exe with its own
// console, which `windowsHide` does not suppress for a detached shell — the user
// saw a stray cmd window. Running the electron-vite bin with a plain Node keeps
// the spawn windowless (measured: `MainWindowHandle = 0`, no new conhost).
//
// `detached: true` is required on every platform, Windows included: a plain child
// is torn down together with this process (measured), so the restarted stack died
// mid-build and the app never came back. Detaching makes it survive `app.exit(0)`
// and also keeps it out of the parent's process group (Ctrl+C in the terminal
// that started Onda must not kill the fresh dev server).
//
// The Node binary comes from `npm_node_execpath` (set whenever Onda was started
// through an npm script), with `node` from PATH as the fallback. Do NOT run the
// Electron binary here with `ELECTRON_RUN_AS_NODE=1` for the whole subtree:
// electron-vite spawns the app with `{ stdio: 'inherit' }` and no `env`, so the
// flag would leak into the new Electron process and it would come up headless as
// plain Node (no window, no logs).
function restartDevCommand(): void {
  const node = process.env['npm_node_execpath'] || 'node';
  const bin = join(app.getAppPath(), 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  // The restarted stack has no terminal attached, so keep its output on disk —
  // otherwise a failed restart is invisible (the app just does not come back).
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

// Clears cookies, localStorage (the first-run flag) and HTTP caches for both
// the main session and the isolated YouTube auth partition.
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
    // Fresh store at the current schema version — the config file itself stays
    // so the next boot does not run the backup/migration dance on an empty one.
    const store = await getStore();
    store.clear();
    store.set(STORE_VERSION_KEY, CURRENT_STORE_VERSION);

    await clearAppCaches();
    const failed = await removeProfileState(app.getPath('userData'), storeBackupFiles());
    await clearLogFile();
    await clearSessionStorages();

    logger.info('reset', `factory reset complete (${failed.length} locked entries kept)`);

    // Dev builds are served by the electron-vite dev/preview server, which shuts
    // down as soon as this Electron process exits. A plain `app.relaunch()` would
    // then boot against a dead URL (ERR_CONNECTION_REFUSED -> blank window), so in
    // dev we restart the dev command instead: new server, new app process, same
    // profile. `ELECTRON_RENDERER_URL` marks "started by electron-vite"; without
    // it (e.g. `electron .`, Playwright) there is nothing to restart — just quit.
    // (Logged before the delay, because `app.exit` skips the flush of anything
    // logged right before it.)
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

    // Give the renderer a moment to show the "restarting" state, then restart
    // with a clean process. `app.exit` deliberately skips the quit flushes, so
    // debounced writers cannot resurrect state that was just deleted.
    setTimeout(() => {
      app.relaunch();
      try {
        app.exit(0);
      } catch (e) {
        // A window `closed` handler threw while Electron tore the windows down
        // (the send guards should prevent it) — retry so the relaunch lands.
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
