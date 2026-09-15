import { app, ipcMain, session } from 'electron';
import type { AppFactoryResetResult } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';
import { getStore } from './cover-store';
import { clearAppCaches } from './app-cache';
import { clearLogFile } from '../log-file';
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
