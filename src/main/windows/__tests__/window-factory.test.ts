import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  dev: false,
  instances: [] as any[],
  openExternal: vi.fn(),
  installGuard: vi.fn(),
  windowIcon: vi.fn(() => 'C:/icon.png'),
  loggerWarn: vi.fn(),
  handlers: new Map<string, (...args: any[]) => void>()
}));

vi.mock('electron', () => ({
  BrowserWindow: class {
    options: any;
    webContents: any;
    show = vi.fn();
    focus = vi.fn();
    loadURL = vi.fn(async () => undefined);
    loadFile = vi.fn(async () => undefined);
    on = vi.fn((event: string, handler: (...args: any[]) => void) => {
      state.handlers.set(event, handler);
      return this;
    });
    constructor(options: any) {
      this.options = options;
      this.webContents = {
        send: vi.fn(),
        setWindowOpenHandler: vi.fn()
      };
      state.instances.push(this);
    }
  },
  shell: { openExternal: state.openExternal }
}));
vi.mock('@electron-toolkit/utils', () => ({
  get is() {
    return { dev: state.dev };
  }
}));
vi.mock('../navigation-guard', () => ({ installNavigationGuard: state.installGuard }));
vi.mock('../window-icon', () => ({ windowIcon: state.windowIcon }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import { createWindow } from '../window-factory';

function last(): any {
  return state.instances.at(-1)!;
}

beforeEach(() => {
  state.dev = false;
  state.instances = [];
  state.handlers.clear();
  state.openExternal.mockReset();
  state.installGuard.mockReset();
  state.windowIcon.mockClear();
  state.loggerWarn.mockReset();
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'];
});

afterEach(() => {
  delete (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'];
  vi.restoreAllMocks();
});

describe('window creation', () => {
  it('hardens web preferences and applies defaults', () => {
    createWindow({ width: 800, height: 600 });
    const win: any = last();

    expect(win.options).toMatchObject({
      icon: 'C:/icon.png',
      width: 800,
      height: 600,
      webPreferences: {
        preload: expect.stringContaining(join('preload', 'index.js')),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });
    expect(state.windowIcon).toHaveBeenCalledTimes(1);
    expect(state.installGuard).toHaveBeenCalledWith(win);
  });

  it('honours icon and webPreferences overrides', () => {
    createWindow({ icon: 'C:/custom.ico', webPreferences: { sandbox: false } });

    const options = last().options;
    expect(options.icon).toBe('C:/custom.ico');
    expect(options.webPreferences.sandbox).toBe(false);
    expect(options.webPreferences.contextIsolation).toBe(true);
  });

  it('shows and focuses on ready-to-show by default', () => {
    const win = createWindow({});

    state.handlers.get('ready-to-show')!();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('skips auto show when disabled', () => {
    const win = createWindow({ autoShow: false });
    expect(state.handlers.has('ready-to-show')).toBe(false);
    expect(win.show).not.toHaveBeenCalled();
  });

  it('prefers a custom ready-to-show handler', () => {
    const onReady = vi.fn();
    const win = createWindow({ autoShow: true, onReadyToShow: onReady });

    state.handlers.get('ready-to-show')!();

    expect(onReady).toHaveBeenCalledWith(win);
    expect(win.show).not.toHaveBeenCalled();
  });

  it('invokes the close callback', () => {
    const onClosed = vi.fn();
    const win = createWindow({ onClosed });

    state.handlers.get('closed')!();

    expect(onClosed).toHaveBeenCalledWith(win);
  });

  it('broadcasts window state changes', () => {
    createWindow({});
    const win: any = last();

    state.handlers.get('maximize')!();
    state.handlers.get('unmaximize')!();
    state.handlers.get('enter-full-screen')!();
    state.handlers.get('leave-full-screen')!();

    expect(win.webContents.send.mock.calls).toEqual([
      ['window:maximized', true],
      ['window:maximized', false],
      ['window:fullscreenChanged', true],
      ['window:fullscreenChanged', false]
    ]);
  });
});

describe('external links', () => {
  function handler() {
    const win = createWindow({});
    return (win.webContents.setWindowOpenHandler as any).mock.calls[0][0];
  }

  it('opens http, https and mailto links externally', () => {
    const open = handler();

    for (const url of ['https://a', 'http://b', 'mailto:c@d']) {
      expect(open({ url })).toEqual({ action: 'deny' });
    }

    expect(state.openExternal.mock.calls.map(([url]) => url)).toEqual([
      'https://a',
      'http://b',
      'mailto:c@d'
    ]);
  });

  it('ignores other protocols', () => {
    const open = handler();
    expect(open({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
    expect(state.openExternal).not.toHaveBeenCalled();
  });

  it('warns about invalid URLs and still denies', () => {
    const open = handler();
    expect(open({ url: 'not a url' })).toEqual({ action: 'deny' });
    expect(state.openExternal).not.toHaveBeenCalled();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'window',
      'setWindowOpenHandler: invalid URL',
      'not a url',
      expect.any(Error)
    );
  });

  it('does not install the handler when external links are disabled', () => {
    const win = createWindow({ openExternal: false });
    expect(win.webContents.setWindowOpenHandler).not.toHaveBeenCalled();
  });
});

describe('loading', () => {
  it('loads an absolute HTML file first', () => {
    const win = createWindow({ loadFilePath: 'C:/splash.html', htmlFile: 'pip.html', hash: 'x' });
    expect(win.loadFile).toHaveBeenCalledWith('C:/splash.html');
    expect(win.loadURL).not.toHaveBeenCalled();
  });

  it('loads a dev html entry with a hash', () => {
    state.dev = true;
    (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
      'http://localhost:5173';
    const win = createWindow({ htmlFile: 'pip.html', hash: '/pip' });

    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:5173/pip.html#/pip');
  });

  it('loads a packaged html entry with hash options', () => {
    const win = createWindow({ htmlFile: 'pip.html', hash: '/pip' });

    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringContaining(join('renderer', 'pip.html')),
      { hash: '/pip' }
    );
  });

  it('loads the dev SPA with and without a hash', () => {
    state.dev = true;
    (process.env as Record<string, string | undefined>)['ELECTRON_RENDERER_URL'] =
      'http://localhost:5173';

    const withHash = createWindow({ hash: '/library' });
    expect(withHash.loadURL).toHaveBeenCalledWith('http://localhost:5173#/library');

    const plain = createWindow({});
    expect(plain.loadURL).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('loads the packaged SPA with hash options', () => {
    const win = createWindow({ hash: '/library' });

    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringContaining(join('renderer', 'index.html')),
      { hash: '/library' }
    );
  });

  it('omits hash options for the packaged entry without a hash', () => {
    const win = createWindow({});

    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringContaining(join('renderer', 'index.html')),
      undefined
    );
  });
});
