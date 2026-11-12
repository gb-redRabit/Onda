import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Warstwa IPC okien: sprawdzamy walidację danych z renderera i mapowanie na
// metody okna. Wszystkie zależności systemowe są podstawione, więc testy nie
// tworzą prawdziwych okien i działają na każdym OS (platformę ustawiamy jawnie).
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  current: null as any,
  byId: new Map<number, any>(),
  main: null as any
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    },
    on: (channel: string, handler: (...args: any[]) => any) => {
      state.listeners.set(channel, handler);
    }
  },
  BrowserWindow: {
    fromWebContents: () => state.current,
    fromId: (id: number) => state.byId.get(id) ?? null
  }
}));

const deps = vi.hoisted(() => ({
  getAutoLaunch: vi.fn(() => ({ enabled: true, hidden: false })),
  setAutoLaunch: vi.fn(() => true),
  setCloseToTray: vi.fn(),
  createExplorerWindow: vi.fn(async () => ({ id: 7 })),
  getExplorerWindows: vi.fn((): any[] => []),
  closeImageViewer: vi.fn(),
  getImageViewerData: vi.fn(() => ({ files: [] })),
  openImageViewer: vi.fn(async () => true),
  registerPipHandlers: vi.fn(),
  setDwmBorderColor: vi.fn(async () => false),
  setDwmRoundedCorners: vi.fn(async () => false)
}));

const logs = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('../../../shared/logger', () => ({ logger: logs }));
vi.mock('../auto-launch', () => ({
  getAutoLaunch: deps.getAutoLaunch,
  setAutoLaunch: deps.setAutoLaunch
}));
vi.mock('../close-behavior', () => ({ setCloseToTray: deps.setCloseToTray }));
vi.mock('../explorer-windows', () => ({
  createExplorerWindow: deps.createExplorerWindow,
  getExplorerWindows: deps.getExplorerWindows
}));
vi.mock('../image-viewer-window', () => ({
  closeImageViewer: deps.closeImageViewer,
  getImageViewerData: deps.getImageViewerData,
  openImageViewer: deps.openImageViewer
}));
vi.mock('../window-ipc-pip', () => ({ registerPipHandlers: deps.registerPipHandlers }));
vi.mock('../dwm', () => ({
  setDwmBorderColor: deps.setDwmBorderColor,
  setDwmRoundedCorners: deps.setDwmRoundedCorners
}));

const { registerWindowHandlers } = await import('../window-ipc');

const preFullscreenBounds = { current: null as Electron.Rectangle | null };
registerWindowHandlers({
  getMainWindow: () => state.main,
  preFullscreenBounds,
  pipManager: {} as never,
  audioPipManager: {} as never
});

type Handler = (...args: any[]) => any;

function handler(channel: string): Handler {
  const found = state.handlers.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

function createWindow() {
  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  const onceHandlers = new Map<string, Array<(...args: any[]) => void>>();
  const win = {
    destroyed: false,
    fullScreen: false,
    maximized: false,
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    isDestroyed: () => win.destroyed,
    isMaximized: () => win.maximized,
    isFullScreen: () => win.fullScreen,
    setFullScreen: vi.fn((value: boolean) => {
      win.fullScreen = value;
    }),
    getBounds: () => ({ ...win.bounds }),
    setBounds: vi.fn((bounds: Electron.Rectangle) => {
      win.bounds = bounds;
    }),
    setBackgroundMaterial: vi.fn(),
    setAccentColor: vi.fn(),
    setShape: vi.fn(),
    setResizable: vi.fn(),
    maximize: vi.fn(() => {
      win.maximized = true;
    }),
    unmaximize: vi.fn(() => {
      win.maximized = false;
    }),
    minimize: vi.fn(),
    close: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    on: vi.fn((event: string, callback: (...args: any[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(callback);
      handlers.set(event, list);
    }),
    once: vi.fn((event: string, callback: (...args: any[]) => void) => {
      const list = onceHandlers.get(event) ?? [];
      list.push(callback);
      onceHandlers.set(event, list);
    }),
    emit: (event: string) => {
      for (const callback of handlers.get(event) ?? []) callback();
      for (const callback of onceHandlers.get(event) ?? []) callback();
      onceHandlers.delete(event);
    },
    webContents: { send: vi.fn() }
  };
  return win;
}

let win: ReturnType<typeof createWindow>;
let platformDescriptor: PropertyDescriptor | undefined;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(() => {
  platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  win = createWindow();
  state.current = win;
  state.main = win;
  state.byId.clear();
  preFullscreenBounds.current = null;
  for (const fn of Object.values(deps)) fn.mockClear();
  deps.getAutoLaunch.mockReturnValue({ enabled: true, hidden: false });
  deps.setAutoLaunch.mockReturnValue(true);
  deps.createExplorerWindow.mockResolvedValue({ id: 7 });
  deps.getExplorerWindows.mockReturnValue([]);
  deps.getImageViewerData.mockReturnValue({ files: [] });
  deps.openImageViewer.mockResolvedValue(true);
  deps.setDwmBorderColor.mockResolvedValue(false);
  deps.setDwmRoundedCorners.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
});

describe('image viewer IPC', () => {
  it('normalizes a bad index to zero', async () => {
    await handler('imageViewer:open')({}, ['a.jpg', 'b.jpg'], Number.NaN);
    expect(deps.openImageViewer).toHaveBeenLastCalledWith(['a.jpg', 'b.jpg'], 0, win);

    await handler('imageViewer:open')({}, ['a.jpg'], -5);
    expect(deps.openImageViewer).toHaveBeenLastCalledWith(['a.jpg'], 0, win);
  });

  it('floors a fractional index', async () => {
    await handler('imageViewer:open')({}, ['a.jpg', 'b.jpg', 'c.jpg'], 1.9);
    expect(deps.openImageViewer).toHaveBeenLastCalledWith(expect.any(Array), 1, win);
  });

  it('passes data and close straight through', () => {
    expect(handler('imageViewer:getData')({})).toEqual({ files: [] });
    handler('imageViewer:close')({});
    expect(deps.closeImageViewer).toHaveBeenCalledTimes(1);
  });
});

describe('explorer IPC', () => {
  it('creates an explorer window only with a string path', async () => {
    await handler('explorer:create')({}, 'C:/music');
    expect(deps.createExplorerWindow).toHaveBeenLastCalledWith('C:/music');

    await handler('explorer:create')({}, 42);
    expect(deps.createExplorerWindow).toHaveBeenLastCalledWith(undefined);
  });

  it('rejects invalid tab-move payloads', () => {
    expect(handler('explorer:tabMoved')({}, 0, 'C:/music')).toEqual({
      ok: false,
      error: 'invalid window id'
    });
    expect(handler('explorer:tabMoved')({}, 1, '')).toEqual({ ok: false, error: 'invalid path' });
    expect(handler('explorer:tabMoved')({}, 1, 'x'.repeat(4097))).toEqual({
      ok: false,
      error: 'invalid path'
    });
  });

  it('removes the tab from the source window', () => {
    const source = createWindow();
    state.byId.set(3, source);
    expect(handler('explorer:tabMoved')({}, 3, 'C:/music')).toEqual({ ok: true });
    expect(source.webContents.send).toHaveBeenCalledWith('explorer:remove-tab', 'C:/music');
  });

  it('ignores a destroyed source window', () => {
    const source = createWindow();
    source.destroyed = true;
    state.byId.set(4, source);
    expect(handler('explorer:tabMoved')({}, 4, 'C:/music')).toEqual({ ok: true });
    expect(source.webContents.send).not.toHaveBeenCalled();
  });

  it('sends a tab to main and refreshes every live explorer window', () => {
    const extra = createWindow();
    const dead = createWindow();
    dead.destroyed = true;
    deps.getExplorerWindows.mockReturnValue([extra, dead]);

    handler('explorer:sendTabToMain')({}, 'C:/music');
    state.listeners.get('explorer:refreshAll')!();

    expect(win.webContents.send).toHaveBeenCalledWith('explorer:add-tab', 'C:/music');
    expect(win.webContents.send).toHaveBeenCalledWith('explorer:refresh');
    expect(extra.webContents.send).toHaveBeenCalledWith('explorer:refresh');
    expect(dead.webContents.send).not.toHaveBeenCalled();
  });
});

describe('window appearance IPC', () => {
  it('rejects an unknown background material', () => {
    setPlatform('win32');
    expect(handler('app:setBackgroundMaterial')({ sender: {} }, 'plasma')).toBe(false);
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });

  it('applies a valid material on Windows only', () => {
    setPlatform('win32');
    expect(handler('app:setBackgroundMaterial')({ sender: {} }, 'acrylic')).toBe(true);
    expect(win.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');

    setPlatform('linux');
    expect(handler('app:setBackgroundMaterial')({ sender: {} }, 'mica')).toBe(false);
  });

  it('validates the border color and falls back to setAccentColor', async () => {
    setPlatform('win32');
    expect(await handler('window:setBorderColor')({ sender: {} }, 'red')).toBe(false);
    expect(await handler('window:setBorderColor')({ sender: {} }, '#12345')).toBe(false);

    deps.setDwmBorderColor.mockResolvedValueOnce(true);
    expect(await handler('window:setBorderColor')({ sender: {} }, '#1a2b3c')).toBe(true);

    expect(await handler('window:setBorderColor')({ sender: {} }, '#ffffff')).toBe(true);
    expect(win.setAccentColor).toHaveBeenCalledWith('#ffffff');
  });

  it('uses shape fallback when DWM rounded corners are unavailable', async () => {
    setPlatform('win32');
    expect(await handler('window:setRoundedCorners')({ sender: {} }, true)).toBe(true);
    expect(win.setShape).toHaveBeenCalledWith([]);

    expect(await handler('window:setRoundedCorners')({ sender: {} }, false)).toBe(true);
    expect(win.setShape).toHaveBeenCalledWith([
      expect.objectContaining({ width: 800 + 32, height: 600 + 32 })
    ]);
  });

  it('rejects a non-boolean rounded-corner flag', async () => {
    expect(await handler('window:setRoundedCorners')({ sender: {} }, 'yes')).toBe(false);
  });
});

describe('window control IPC', () => {
  it('minimizes, toggles maximize and closes the sender window', () => {
    handler('window:minimize')({ sender: {} });
    expect(win.minimize).toHaveBeenCalledTimes(1);

    handler('window:maximize')({ sender: {} });
    expect(win.maximize).toHaveBeenCalledTimes(1);
    handler('window:maximize')({ sender: {} });
    expect(win.unmaximize).toHaveBeenCalledTimes(1);

    handler('window:close')({ sender: {} });
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('validates always-on-top input', () => {
    expect(handler('window:setAlwaysOnTop')({ sender: {} }, 'true')).toBe(false);
    expect(handler('window:setAlwaysOnTop')({ sender: {} }, true)).toBe(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it('stores bounds when entering fullscreen and restores them on exit', () => {
    win.maximized = true;
    expect(handler('window:toggleFullscreen')({ sender: {} })).toBe(true);
    expect(win.setFullScreen).toHaveBeenCalledWith(true);
    expect(preFullscreenBounds.current).toMatchObject({ width: 800, height: 600 });

    // Symulujemy wyjście z pełnego ekranu przez zdarzenie okna.
    win.fullScreen = true;
    const exit = handler('window:toggleFullscreen');
    expect(exit({ sender: {} })).toBe(false);
    win.emit('leave-full-screen');

    expect(win.maximize).toHaveBeenCalled();
    expect(win.setResizable).toHaveBeenNthCalledWith(1, false);
    expect(win.setResizable).toHaveBeenNthCalledWith(2, true);
    expect(preFullscreenBounds.current).toBeNull();
  });

  it('restores bounds from the emergency timer when the event never fires', () => {
    vi.useFakeTimers();
    preFullscreenBounds.current = { x: 0, y: 0, width: 640, height: 480 };
    win.fullScreen = true;

    handler('window:exitFullscreen')({ sender: {} });
    expect(win.setFullScreen).toHaveBeenCalledWith(false);

    vi.advanceTimersByTime(400);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 640, height: 480 });
    expect(preFullscreenBounds.current).toBeNull();
  });

  it('does nothing on exit when the window is not fullscreen', () => {
    handler('window:exitFullscreen')({ sender: {} });
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });

  it('reports the fullscreen state', () => {
    win.fullScreen = true;
    expect(handler('window:isFullscreen')({ sender: {} })).toBe(true);
    win.fullScreen = false;
    expect(handler('window:isFullscreen')({ sender: {} })).toBe(false);
  });
});

describe('app preference IPC', () => {
  it('returns and writes auto-launch options', () => {
    expect(handler('app:getAutoLaunch')({})).toEqual({ enabled: true, hidden: false });

    handler('app:setAutoLaunch')({}, { enabled: 1, hidden: 0 });
    expect(deps.setAutoLaunch).toHaveBeenCalledWith({ enabled: true, hidden: false });

    handler('app:setAutoLaunch')({}, undefined);
    expect(deps.setAutoLaunch).toHaveBeenLastCalledWith({ enabled: false, hidden: false });
  });

  it('coerces close-to-tray and reports success', () => {
    expect(handler('app:setCloseToTray')({}, 'yes')).toBe(true);
    expect(deps.setCloseToTray).toHaveBeenCalledWith(true);
  });
});

describe('appearance fallbacks and guards', () => {
  it('ignores corners on non-Windows and when DWM succeeds', async () => {
    setPlatform('linux');
    expect(await handler('window:setRoundedCorners')({ sender: {} }, false)).toBe(false);

    setPlatform('win32');
    deps.setDwmRoundedCorners.mockResolvedValueOnce(true);
    expect(await handler('window:setRoundedCorners')({ sender: {} }, true)).toBe(true);
    expect(win.setShape).not.toHaveBeenCalled();
  });

  it('falls back to an inset shape when the first setShape throws', async () => {
    setPlatform('win32');
    win.setShape.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });

    expect(await handler('window:setRoundedCorners')({ sender: {} }, false)).toBe(true);

    expect(win.setShape).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ x: 0, y: 0, width: 800 + 32, height: 600 + 32 })
    ]);
  });

  it('logs and reports failure when every shape attempt throws', async () => {
    setPlatform('win32');
    win.setShape.mockImplementation(() => {
      throw new Error('no shape');
    });

    expect(await handler('window:setRoundedCorners')({ sender: {} }, false)).toBe(false);

    expect(logs.warn).toHaveBeenCalledWith(
      'window',
      'setShape failed (non-fatal)',
      expect.any(Error)
    );
  });

  it('reapplies square corners after resize and forgets them on close', async () => {
    setPlatform('win32');
    handler('window:setRoundedCorners')({ sender: {} }, false);
    deps.setDwmRoundedCorners.mockClear();

    win.emit('resize');
    expect(deps.setDwmRoundedCorners).toHaveBeenCalledWith(win, false);

    win.destroyed = true;
    win.emit('resize');
    expect(deps.setDwmRoundedCorners).toHaveBeenCalledTimes(1);

    win.destroyed = false;
    win.emit('closed');
    deps.setDwmRoundedCorners.mockClear();
    win.emit('resize');
    expect(deps.setDwmRoundedCorners).not.toHaveBeenCalled();
  });

  it('returns false when the sender window is gone or destroyed', async () => {
    setPlatform('win32');
    state.current = null;
    state.main = null;

    expect(handler('app:setBackgroundMaterial')({ sender: {} }, 'mica')).toBe(false);
    expect(await handler('window:setBorderColor')({ sender: {} }, '#123456')).toBe(false);
    expect(await handler('window:setRoundedCorners')({ sender: {} }, true)).toBe(false);

    state.current = win;
    state.main = win;
    win.destroyed = true;
    expect(handler('app:setBackgroundMaterial')({ sender: {} }, 'mica')).toBe(false);
    expect(await handler('window:setBorderColor')({ sender: {} }, '#123456')).toBe(false);
    expect(handler('window:setAlwaysOnTop')({ sender: {} }, true)).toBe(false);

    state.current = null;
    expect(handler('window:setAlwaysOnTop')({ sender: {} }, true)).toBe(false);
  });

  it('rejects border colors outside Windows', async () => {
    setPlatform('linux');
    expect(await handler('window:setBorderColor')({ sender: {} }, '#123456')).toBe(false);
  });

  it('falls back to false when setAccentColor throws', async () => {
    setPlatform('win32');
    win.setAccentColor.mockImplementationOnce(() => {
      throw new Error('accent');
    });

    expect(await handler('window:setBorderColor')({ sender: {} }, '#abcdef')).toBe(false);
    expect(logs.warn).toHaveBeenCalledWith(
      'window',
      'setAccentColor failed (non-fatal)',
      expect.any(Error)
    );
  });
});

describe('material reapplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPlatform('win32');
  });

  it('debounces repeated focus events and reapplies the material', () => {
    handler('app:setBackgroundMaterial')({ sender: {} }, 'acrylic');
    win.setBackgroundMaterial.mockClear();

    win.emit('focus');
    win.emit('focus');
    vi.advanceTimersByTime(80);

    expect(win.setBackgroundMaterial).toHaveBeenCalledTimes(1);
    expect(win.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
  });

  it('installs listeners only once per window', () => {
    handler('app:setBackgroundMaterial')({ sender: {} }, 'mica');
    const afterFirst = win.on.mock.calls.length;

    handler('app:setBackgroundMaterial')({ sender: {} }, 'acrylic');

    expect(win.on.mock.calls.length).toBe(afterFirst);
  });

  it('does nothing after the window is closed', () => {
    handler('app:setBackgroundMaterial')({ sender: {} }, 'mica');
    win.setBackgroundMaterial.mockClear();

    win.emit('focus');
    win.emit('closed');
    win.emit('focus');
    vi.advanceTimersByTime(80);

    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });

  it('skips reapplication outside Windows', () => {
    handler('app:setBackgroundMaterial')({ sender: {} }, 'mica');
    win.setBackgroundMaterial.mockClear();
    setPlatform('linux');

    win.emit('focus');
    vi.advanceTimersByTime(80);

    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });

  it('logs and reports failure when the material is unsupported', () => {
    win.setBackgroundMaterial.mockImplementationOnce(() => {
      throw new Error('material');
    });

    expect(handler('app:setBackgroundMaterial')({ sender: {} }, 'tabbed')).toBe(false);
    expect(logs.warn).toHaveBeenCalledWith(
      'window',
      'setBackgroundMaterial failed (non-fatal)',
      expect.any(Error)
    );
  });
});

describe('fullscreen guards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns false without a window', () => {
    state.current = null;
    state.main = null;

    expect(handler('window:toggleFullscreen')({ sender: {} })).toBe(false);
    handler('window:exitFullscreen')({ sender: {} });
  });

  it('ignores a destroyed window when restoring bounds', () => {
    preFullscreenBounds.current = { x: 0, y: 0, width: 640, height: 480 };
    win.fullScreen = true;
    handler('window:exitFullscreen')({ sender: {} });
    win.destroyed = true;

    win.emit('leave-full-screen');

    expect(win.setBounds).not.toHaveBeenCalled();
    expect(preFullscreenBounds.current).not.toBeNull();
  });

  it('skips restoration when no bounds were stored', () => {
    preFullscreenBounds.current = null;
    win.fullScreen = true;
    handler('window:exitFullscreen')({ sender: {} });

    win.emit('leave-full-screen');

    expect(win.setBounds).not.toHaveBeenCalled();
    expect(win.setResizable).not.toHaveBeenCalled();
  });

  it('restores once even if both the event and timer fire', () => {
    preFullscreenBounds.current = { x: 1, y: 2, width: 300, height: 200 };

    win.maximized = true;
    handler('window:toggleFullscreen')({ sender: {} });
    win.fullScreen = true;
    handler('window:toggleFullscreen')({ sender: {} });

    win.emit('leave-full-screen');
    vi.advanceTimersByTime(400);

    expect(win.setResizable).toHaveBeenCalledTimes(2);
  });

  it('restores once through exitFullscreen when both sources fire', () => {
    preFullscreenBounds.current = { x: 1, y: 2, width: 300, height: 200 };
    win.fullScreen = true;
    handler('window:exitFullscreen')({ sender: {} });

    win.emit('leave-full-screen');
    vi.advanceTimersByTime(400);

    expect(win.setBounds).toHaveBeenCalledTimes(1);
  });
});
