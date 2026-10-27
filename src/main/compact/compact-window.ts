import { BrowserWindow } from 'electron';
import { logger } from '../../shared/logger';
import { createWindow } from '../windows/window-factory';
import { GLASS_WINDOW_OPTS } from '../windows/window-presets';
import { windowIcon } from '../windows/window-icon';

/**
 * Mały shell trybu kompaktowego. Audio należy do ukrytego Core — to okno tylko
 * wyświetla stan i wysyła komendy. Faza 3: uruchamiane przez `ONDA_COMPACT=1`.
 */
export function createCompactWindow(): BrowserWindow {
  const win = createWindow({
    width: 420,
    height: 680,
    minWidth: 360,
    minHeight: 520,
    show: false,
    ...GLASS_WINDOW_OPTS,
    icon: windowIcon(),
    title: 'Onda',
    htmlFile: 'compact.html',
    autoShow: true,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  win.on('closed', () => logger.info('compact', 'window closed'));
  return win;
}
