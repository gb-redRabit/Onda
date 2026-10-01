import { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { logger } from '../../shared/logger';
import { isAllowedNavigationUrl, type NavigationPolicyOptions } from './navigation-policy';

// Blokuje nawigacje ramki głównej poza własne originy aplikacji (file:, onda:,
// serwer dev). Początkowe wywołania loadURL/loadFile są programistyczne i nie
// wyzwalają will-navigate, więc pozostają niezmienione. Nawigacje podramek
// (np. embed YouTube) są regulowane przez CSP renderera (frame-src).
export function installNavigationGuard(
  win: BrowserWindow,
  options: NavigationPolicyOptions = {}
): void {
  const devUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined;
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigationUrl(url, devUrl, options)) return;
    logger.warn('main', 'blocked navigation to', url);
    event.preventDefault();
  });
}
