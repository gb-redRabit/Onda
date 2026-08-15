import { BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { logger } from '../shared/logger';
import { isAllowedNavigationUrl, type NavigationPolicyOptions } from './navigation-policy';

// Blocks top-frame navigations away from the app's own origins (file:, onda:,
// dev server). The initial loadURL/loadFile calls are programmatic and do not
// trigger will-navigate, so they are unaffected. Subframe navigations (e.g. the
// YouTube embed) are governed by the renderer CSP (frame-src).
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