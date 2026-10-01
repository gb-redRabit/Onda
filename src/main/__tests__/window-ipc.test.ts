import { describe, it, expect, vi } from 'vitest';

// Przechwytuje kanały rejestrowane przez moduł bez prawdziwego ipcMain.
const { handlers, openImageViewer } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openImageViewer: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: () => {},
    once: () => {}
  },
  BrowserWindow: {
    fromWebContents: () => null,
    fromId: () => null,
    getAllWindows: () => []
  },
  app: {
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: () => {}
  }
}));

vi.mock('../windows/window-ipc-pip', () => ({ registerPipHandlers: () => {} }));
vi.mock('../windows/close-behavior', () => ({ setCloseToTray: () => {} }));
vi.mock('../windows/explorer-windows', () => ({
  createExplorerWindow: () => 1,
  getExplorerWindows: () => []
}));
vi.mock('../windows/image-viewer-window', () => ({
  openImageViewer,
  getImageViewerData: () => null,
  closeImageViewer: () => {}
}));

import { registerWindowHandlers } from '../windows/window-ipc';

function setup(): void {
  registerWindowHandlers({
    getMainWindow: () => null,
    preFullscreenBounds: { current: null },
    pipManager: {} as never,
    audioPipManager: {} as never
  });
}

describe('window-ipc imageViewer:open', () => {
  it('passes a valid non-negative integer index through', () => {
    setup();
    const handler = handlers.get('imageViewer:open');
    expect(typeof handler).toBe('function');

    handler?.({}, ['a.jpg', 'b.jpg'], 1);
    expect(openImageViewer).toHaveBeenLastCalledWith(['a.jpg', 'b.jpg'], 1);
  });

  it('coerces NaN to 0 instead of forwarding it', () => {
    setup();
    handlers.get('imageViewer:open')?.({}, ['a.jpg'], Number.NaN);
    expect(openImageViewer).toHaveBeenLastCalledWith(['a.jpg'], 0);
  });

  it('coerces negatives and non-numbers to 0', () => {
    setup();
    const handler = handlers.get('imageViewer:open');
    handler?.({}, ['a.jpg'], -5);
    expect(openImageViewer).toHaveBeenLastCalledWith(['a.jpg'], 0);

    handler?.({}, ['a.jpg'], 'nope');
    expect(openImageViewer).toHaveBeenLastCalledWith(['a.jpg'], 0);
  });
});
