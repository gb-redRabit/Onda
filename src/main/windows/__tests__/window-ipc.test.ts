import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { handleMock, fromWebContentsMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  fromWebContentsMock: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, on: vi.fn() },
  BrowserWindow: { fromWebContents: fromWebContentsMock, fromId: vi.fn() }
}));

vi.mock('../../../shared/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('../auto-launch', () => ({ getAutoLaunch: vi.fn(), setAutoLaunch: vi.fn() }));
vi.mock('../close-behavior', () => ({ setCloseToTray: vi.fn() }));
vi.mock('../explorer-windows', () => ({
  createExplorerWindow: vi.fn(),
  getExplorerWindows: () => []
}));
vi.mock('../image-viewer-window', () => ({
  closeImageViewer: vi.fn(),
  getImageViewerData: vi.fn(),
  openImageViewer: vi.fn()
}));
vi.mock('../window-ipc-pip', () => ({ registerPipHandlers: vi.fn() }));

import { seedWindowMaterial, registerWindowHandlers } from '../window-ipc';

type FakeWindow = EventEmitter & {
  isDestroyed: () => boolean;
  setBackgroundMaterial: ReturnType<typeof vi.fn>;
};

function makeWindow(): FakeWindow {
  const win = new EventEmitter() as FakeWindow;
  win.isDestroyed = () => false;
  win.setBackgroundMaterial = vi.fn();
  return win;
}

const realPlatform = process.platform;

describe('seedWindowMaterial', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  });

  it('installs the re-apply listeners so the seeded material lands after show', () => {
    const win = makeWindow();

    seedWindowMaterial(win as never, 'acrylic');
    // Seed sam w sobie nic nie maluje — dopiero re-apply po pokazaniu okna.
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();

    win.emit('show');
    vi.advanceTimersByTime(100);
    expect(win.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
  });

  it('re-applies on focus as well', () => {
    const win = makeWindow();
    seedWindowMaterial(win as never, 'acrylic');

    win.emit('focus');
    vi.advanceTimersByTime(100);
    expect(win.setBackgroundMaterial).toHaveBeenCalledWith('acrylic');
  });
});

describe('app:setBackgroundMaterial dedupe', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    handleMock.mockClear();
    fromWebContentsMock.mockReset();
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  });

  function handler(): (event: unknown, material: string) => boolean {
    registerWindowHandlers({
      getMainWindow: () => null,
      preFullscreenBounds: { current: null },
      pipManager: {} as never,
      audioPipManager: {} as never
    });
    const call = handleMock.mock.calls.find(([channel]) => channel === 'app:setBackgroundMaterial');
    expect(call).toBeTruthy();
    return call![1] as (event: unknown, material: string) => boolean;
  }

  it('skips a redundant apply when the window already carries the material', () => {
    const win = makeWindow();
    fromWebContentsMock.mockReturnValue(win);
    const event = { sender: {} };
    const invoke = handler();

    seedWindowMaterial(win as never, 'acrylic');
    expect(invoke(event, 'acrylic')).toBe(true);
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();

    // Zmiana materiału musi nadal zostać zastosowana.
    expect(invoke(event, 'mica')).toBe(true);
    expect(win.setBackgroundMaterial).toHaveBeenCalledWith('mica');
  });
});
