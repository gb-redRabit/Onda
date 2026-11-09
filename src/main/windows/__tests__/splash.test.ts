import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createWindow: vi.fn(),
  loggerInfo: vi.fn(),
  win: null as any,
  main: null as any
}));

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../window-factory', () => ({ createWindow: state.createWindow }));
vi.mock('../../../shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
import { SplashController } from '../splash';

function windowMock(overrides: Record<string, unknown> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    close: vi.fn(),
    destroy: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isVisible: vi.fn(() => false),
    webContents: { send: vi.fn() },
    ...overrides
  };
}

function setup(overrides: { startHidden?: boolean; main?: any } = {}) {
  state.main = overrides.main ?? windowMock();
  return new SplashController({
    windowIcon: () => 'C:/icon.png',
    getMainWindow: () => state.main,
    isStartHidden: () => overrides.startHidden ?? false
  });
}

function start(controller: SplashController) {
  controller.start();
  return state.createWindow.mock.calls.at(-1)![0];
}

beforeEach(() => {
  state.win = windowMock();
  state.createWindow.mockReset();
  state.createWindow.mockReturnValue(state.win);
  state.loggerInfo.mockReset();
  vi.spyOn(performance, 'now').mockReturnValue(1000);
});

describe('starting', () => {
  it('creates a frameless splash window with the splash preload', () => {
    const controller = setup();
    const options = start(controller);

    expect(options).toMatchObject({
      width: 400,
      height: 300,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      autoShow: false,
      openExternal: false,
      icon: 'C:/icon.png',
      webPreferences: {
        sandbox: true,
        preload: expect.stringContaining('splash.js')
      },
      loadFilePath: expect.stringContaining('splash.html')
    });
    expect(controller.isActive()).toBe(true);
  });

  it('keeps a newer splash when an older close callback fires', () => {
    const first = windowMock();
    const second = windowMock();
    state.createWindow.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = setup();

    controller.start();
    const firstOptions = state.createWindow.mock.calls[0][0];
    firstOptions.onClosed();
    expect(controller.isActive()).toBe(false);

    controller.start();
    firstOptions.onClosed();
    expect(controller.isActive()).toBe(true);
  });
});

describe('readiness gate', () => {
  it('waits for all three signals before showing the main window', () => {
    vi.mocked(performance.now).mockReturnValueOnce(1000).mockReturnValue(1250);
    const controller = setup();
    start(controller);

    controller.onMainReady();
    controller.onMinTimerDone();
    expect(state.win.close).not.toHaveBeenCalled();
    expect(state.main.show).not.toHaveBeenCalled();

    controller.onRendererReady();

    expect(controller.isRendererReady()).toBe(true);
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'boot',
      expect.stringContaining('SHOW WINDOW — 250ms')
    );
    expect(state.win.webContents.send).toHaveBeenCalledWith('splash:status', {
      label: 'Gotowe',
      progress: 100
    });
    expect(state.win.close).toHaveBeenCalledTimes(1);
    expect(state.main.show).toHaveBeenCalledTimes(1);
    expect(state.main.focus).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
  });

  it('skips showing the main window when starting hidden', () => {
    const controller = setup({ startHidden: true });
    start(controller);

    controller.onMainReady();
    controller.onMinTimerDone();
    controller.onRendererReady();

    expect(state.main.show).not.toHaveBeenCalled();
    expect(state.main.focus).not.toHaveBeenCalled();
  });

  it('tolerates a destroyed splash and a missing main window', () => {
    state.win.isDestroyed.mockReturnValue(true);
    const controller = setup({ main: null });
    start(controller);

    controller.onMainReady();
    controller.onMinTimerDone();
    controller.onRendererReady();

    expect(state.win.close).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });

  it('handles signals arriving in any order', () => {
    const controller = setup();
    start(controller);

    controller.onRendererReady();
    controller.onMinTimerDone();
    expect(state.main.show).not.toHaveBeenCalled();

    controller.onMainReady();
    expect(state.main.show).toHaveBeenCalledTimes(1);
  });
});

describe('status updates', () => {
  it('sends progress while the splash lives', () => {
    const controller = setup();
    start(controller);

    controller.send('Ładowanie', 40);

    expect(state.win.webContents.send).toHaveBeenCalledWith('splash:status', {
      label: 'Ładowanie',
      progress: 40
    });
  });

  it('ignores updates without an active window', () => {
    const controller = setup();
    expect(() => controller.send('x', 1)).not.toThrow();

    start(controller);
    state.win.isDestroyed.mockReturnValue(true);
    controller.send('x', 1);

    expect(state.win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('forces the splash closed and reveals the main window', () => {
    const controller = setup();
    start(controller);

    controller.forceClose();

    expect(state.win.close).toHaveBeenCalledTimes(1);
    expect(state.main.show).toHaveBeenCalledTimes(1);
    expect(state.main.focus).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
  });

  it('does not reveal an already visible or hidden-start window', () => {
    const visible = windowMock({ isVisible: vi.fn(() => true) });
    const controller = setup({ main: visible });
    start(controller);
    controller.forceClose();
    expect(visible.show).not.toHaveBeenCalled();

    const hiddenStart = setup({ startHidden: true, main: windowMock() });
    start(hiddenStart);
    hiddenStart.forceClose();
    expect(state.main.show).not.toHaveBeenCalled();
  });

  it('is safe without a splash', () => {
    const controller = setup();
    expect(() => controller.forceClose()).not.toThrow();
  });

  it('destroys the splash window', () => {
    const controller = setup();
    start(controller);

    controller.destroy();
    expect(state.win.destroy).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);

    controller.start();
    state.win.isDestroyed.mockReturnValue(true);
    controller.destroy();
    expect(state.win.destroy).toHaveBeenCalledTimes(1);
  });
});
