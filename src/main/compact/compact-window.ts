import { BrowserWindow, screen } from 'electron';
import { logger } from '../../shared/logger';
import { createWindow } from '../windows/window-factory';
import { GLASS_WINDOW_OPTS } from '../windows/window-presets';
import { windowIcon } from '../windows/window-icon';
import { saveCompactState, type CompactState, type WindowBounds } from './compact-state';

interface CompactWindowOptions {
  state?: CompactState;
  /** Start pokazany od razu (przełączenie w trakcie działania). Start aplikacji używa splashu. */
  showOnReady?: boolean;
  /** Zamknięcie okna (X/Alt+F4) chowa do tray zamiast niszczyć, gdy app nie kończy pracy. */
  hideOnClose?: () => boolean;
}

function isVisibleOnAnyDisplay(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    const overlapX = Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y);
    return overlapX > 80 && overlapY > 80;
  });
}

/**
 * Mały shell trybu kompaktowego. Audio należy do ukrytego Core — to okno tylko
 * wyświetla stan i wysyła komendy. Startuje z zapisanej geometrii, a zmiany
 * rozmiaru/pozycji trafiają do `compact-window-state.json`.
 */
export function createCompactWindow(options: CompactWindowOptions = {}): BrowserWindow {
  const saved = options.state?.bounds;
  const bounds = saved && isVisibleOnAnyDisplay(saved) ? saved : null;

  const win = createWindow({
    width: bounds?.width ?? 420,
    height: bounds?.height ?? 680,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 360,
    minHeight: 520,
    show: false,
    ...GLASS_WINDOW_OPTS,
    icon: windowIcon(),
    title: 'Onda',
    htmlFile: 'compact.html',
    autoShow: options.showOnReady === true,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleBoundsSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
      void saveCompactState({ bounds: win.getBounds() });
    }, 600);
  };
  win.on('move', scheduleBoundsSave);
  win.on('resize', scheduleBoundsSave);
  win.on('close', (event) => {
    if (options.hideOnClose?.()) {
      event.preventDefault();
      win.hide();
      logger.info('compact', 'hidden to tray');
    }
  });
  win.on('closed', () => {
    if (saveTimer) clearTimeout(saveTimer);
    logger.info('compact', 'window closed');
  });

  return win;
}
