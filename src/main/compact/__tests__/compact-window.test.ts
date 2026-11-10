import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  win: null as any,
  handlers: new Map<string, (...args: any[]) => void>(),
  createWindow: vi.fn(),
  saveState: vi.fn(),
  getAllDisplays: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: { getAllDisplays: h.getAllDisplays }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../windows/window-factory', () => ({ createWindow: h.createWindow }));
vi.mock('../../windows/window-presets', () => ({ GLASS_WINDOW_OPTS: { transparent: true } }));
vi.mock('../../windows/window-icon', () => ({ windowIcon: () => '/icon.ico' }));
vi.mock('../compact-state', () => ({ saveCompactState: h.saveState }));

import { createCompactWindow } from '../compact-window';

function makeWin() {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 10, y: 20, width: 500, height: 700 })),
    setAlwaysOnTop: vi.fn(),
    hide: vi.fn(),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      h.handlers.set(event, handler);
    })
  };
}

beforeEach(() => {
  h.handlers.clear();
  h.win = makeWin();
  h.createWindow.mockReset();
  h.createWindow.mockReturnValue(h.win);
  h.saveState.mockReset();
  h.saveState.mockResolvedValue(undefined);
  h.getAllDisplays.mockReset();
  h.getAllDisplays.mockReturnValue([{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]);
  h.loggerInfo.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('window creation', () => {
  it('restores visible bounds and always-on-top', () => {
    createCompactWindow({
      state: {
        mode: 'compact',
        bounds: { x: 100, y: 100, width: 500, height: 700 },
        alwaysOnTop: true
      },
      showOnReady: true
    });

    expect(h.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 500,
        height: 700,
        x: 100,
        y: 100,
        show: false,
        autoShow: true,
        icon: '/icon.ico',
        htmlFile: 'compact.html'
      })
    );
    expect(h.win.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('falls back to default size for off-screen bounds', () => {
    h.getAllDisplays.mockReturnValue([{ workArea: { x: 0, y: 0, width: 800, height: 600 } }]);

    createCompactWindow({
      state: { mode: 'compact', bounds: { x: 5000, y: 5000, width: 500, height: 700 } }
    });

    expect(h.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ width: 420, height: 680 })
    );
    expect(h.createWindow.mock.calls[0][0]).not.toHaveProperty('x');
  });

  it('detects partial overlap with a display', () => {
    createCompactWindow({
      state: { mode: 'compact', bounds: { x: 1800, y: 980, width: 500, height: 700 } }
    });

    expect(h.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ width: 500, height: 700, x: 1800, y: 980 })
    );
  });
});

describe('bounds persistence', () => {
  it('debounces and saves bounds after move/resize', async () => {
    createCompactWindow();

    h.handlers.get('move')!();
    await vi.advanceTimersByTimeAsync(300);
    h.handlers.get('resize')!();
    await vi.advanceTimersByTimeAsync(600);

    expect(h.saveState).toHaveBeenCalledTimes(1);
    expect(h.saveState).toHaveBeenCalledWith({
      bounds: { x: 10, y: 20, width: 500, height: 700 }
    });
  });

  it('skips saving for destroyed, minimized or maximized windows', async () => {
    createCompactWindow();

    h.win.isDestroyed.mockReturnValueOnce(true);
    h.handlers.get('move')!();
    await vi.advanceTimersByTimeAsync(600);

    h.win.isMinimized.mockReturnValueOnce(true);
    h.handlers.get('move')!();
    await vi.advanceTimersByTimeAsync(600);

    h.win.isMaximized.mockReturnValueOnce(true);
    h.handlers.get('move')!();
    await vi.advanceTimersByTimeAsync(600);

    expect(h.saveState).not.toHaveBeenCalled();
  });

  it('drops a pending save when the window closes', async () => {
    createCompactWindow();

    h.handlers.get('move')!();
    h.handlers.get('closed')!();
    await vi.advanceTimersByTimeAsync(1000);

    expect(h.saveState).not.toHaveBeenCalled();
    expect(h.loggerInfo).toHaveBeenCalledWith('compact', 'window closed');
  });
});

describe('close behaviour', () => {
  it('hides to tray when requested', () => {
    createCompactWindow({ hideOnClose: () => true });
    const event = { preventDefault: vi.fn() };

    h.handlers.get('close')!(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(h.win.hide).toHaveBeenCalled();
    expect(h.loggerInfo).toHaveBeenCalledWith('compact', 'hidden to tray');
  });

  it('closes normally without the hide callback', () => {
    createCompactWindow();
    const event = { preventDefault: vi.fn() };

    h.handlers.get('close')!(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.win.hide).not.toHaveBeenCalled();
  });

  it('respects a declined hide request', () => {
    createCompactWindow({ hideOnClose: () => false });
    const event = { preventDefault: vi.fn() };

    h.handlers.get('close')!(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
