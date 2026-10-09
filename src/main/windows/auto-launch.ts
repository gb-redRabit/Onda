import { app } from 'electron';
import { logger } from '../../shared/logger';

export interface AutoLaunchOptions {
  enabled: boolean;
  hidden?: boolean;
}

// Windows zapisuje wpis autostartu pod ścieżką `process.execPath`. W trybie dev
// jest to `node_modules/electron/dist/electron.exe`, który po restarcie systemu
// startuje bez ścieżki aplikacji i pokazuje domyślne okno Electrona. Dlatego
// autostart rejestrujemy wyłącznie dla spakowanej aplikacji, a w dev sprzątamy
// ewentualny osierocony wpis z wcześniejszych uruchomień.
export function setAutoLaunch({ enabled, hidden = false }: AutoLaunchOptions): boolean {
  try {
    if (!app.isPackaged) {
      try {
        app.setLoginItemSettings({ openAtLogin: false });
      } catch {
        /* brak wpisu do usunięcia */
      }
      logger.info('window', 'autoLaunch pominięty — build dev (wpis autostartu niepakowany)');
      return true;
    }
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // Ukryty start realizujemy argumentem `--hidden` (odczytywanym w `index.ts`).
      // Electron 44 usunął `openAsHidden` (działało tylko na macOS ≤12).
      args: hidden ? ['--hidden'] : []
    });
    return true;
  } catch (e) {
    logger.warn('window', 'setAutoLaunch failed', e);
    return false;
  }
}

export function getAutoLaunch(): { enabled: boolean; hidden: boolean } {
  try {
    const s = app.getLoginItemSettings() as {
      openAtLogin: boolean;
      args?: string[];
      launchArgs?: string[];
    };
    const args = s.args ?? s.launchArgs ?? [];
    return { enabled: !!s.openAtLogin, hidden: args.includes('--hidden') };
  } catch {
    return { enabled: false, hidden: false };
  }
}
