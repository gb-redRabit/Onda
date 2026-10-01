import { BrowserWindow } from 'electron';
import { logger } from '../../shared/logger';
import { createWindow } from './window-factory';

// Explorer windows (secondary file-browser windows) extracted from
// `window-ipc.ts` (plan 2.8).

const explorerWindows = new Map<number, BrowserWindow>();

export function createExplorerWindow(initialPath?: string): number | null {
  try {
    const win = createWindow({
      width: 1000,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      title: 'Explorer',
      hasShadow: false,
      transparent: true,
      backgroundColor: '#00000000',
      ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
      ...(process.platform === 'darwin'
        ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
        : {}),
      hash: `/explorer/window/${Date.now()}${initialPath ? `?path=${encodeURIComponent(initialPath)}` : ''}`,
      onClosed: (w) => {
        explorerWindows.delete(w.id);
      }
    });

    const id = win.id;
    explorerWindows.set(id, win);
    return id;
  } catch (e) {
    logger.warn('window', 'createExplorerWindow failed', e);
    return null;
  }
}

export function getExplorerWindows(): BrowserWindow[] {
  return [...explorerWindows.values()];
}
