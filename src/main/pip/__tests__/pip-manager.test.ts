import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Manager PiP: okno i preview są podstawione, więc testujemy maszynę stanów
// (ready/pending/loadedSrc), routing IPC i delegację do preview.
const state = vi.hoisted(() => ({
  window: null as any,
  windowOptions: null as any,
  paths: new Map<string, string>(),
  throwOnResolve: false,
  loggerWarn: vi.fn(),
  listeners: new Map<string, (...args: any[]) => any>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  preview: {
    setClosedHandler: vi.fn(),
    show: vi.fn(() => true),
    hide: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    owns: vi.fn(() => false),
    updateTheme: vi.fn(),
    updateLocale: vi.fn()
  }
}));

const ipcMain = {
  on: (channel: string, handler: (...args: any[]) => any) => {
    state.listeners.set(channel, handler);
  },
  handle: (channel: string, handler: (...args: any[]) => any) => {
    state.handlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    state.handlers.delete(channel);
  },
  removeAllListeners: (channel: string) => {
    state.listeners.delete(channel);
  }
};

vi.mock('electron', () => ({ ipcMain, BrowserWindow: {} }));
vi.mock('../pip-preview', () => ({
  PipPreview: function PipPreview() {
    return state.preview;
  }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../windows/window-factory', () => ({
  createWindow: (options: unknown) => {
    state.windowOptions = options;
    return state.window;
  }
}));
vi.mock('../pip-icon', () => ({ pipWindowIcon: () => 'pip-icon' }));
vi.mock('../pip-position', () => ({
  computePipPosition: (opts: { width: number; height: number }) => ({
    x: 10,
    y: 20,
    width: opts.width,
    height: opts.height
  })
}));
vi.mock('../../path-utils', () => ({
  resolveMediaPath: (url: string) => {
    if (state.throwOnResolve) throw new Error('bad path');
    return state.paths.get(url) ?? url.toLowerCase();
  }
}));

const { PipManager } = await import('../pip-manager');

function createWindow() {
  const webContents = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    isDestroyed: () => boolean;
  };
  webContents.send = vi.fn();
  webContents.isDestroyed = () => false;
  const win = Object.assign(new EventEmitter(), {
    destroyed: false,
    visible: true,
    webContents,
    isDestroyed: vi.fn(() => win.destroyed),
    isVisible: vi.fn(() => win.visible),
    setBounds: vi.fn(),
    show: vi.fn(() => {
      win.visible = true;
    }),
    focus: vi.fn(),
    hide: vi.fn(() => {
      win.visible = false;
    }),
    destroy: vi.fn(() => {
      win.destroyed = true;
    })
  });
  return win;
}

let manager: InstanceType<typeof PipManager>;
let win: ReturnType<typeof createWindow>;
let mainWindow: {
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean };
};

beforeEach(() => {
  vi.useFakeTimers();
  state.listeners.clear();
  state.handlers.clear();
  for (const fn of Object.values(state.preview)) fn.mockClear();
  state.preview.show.mockReturnValue(true);
  state.preview.owns.mockReturnValue(false);
  state.loggerWarn.mockClear();
  state.paths.clear();
  state.throwOnResolve = false;
  state.windowOptions = null;
  win = createWindow();
  state.window = win;
  mainWindow = {
    isDestroyed: () => false,
    webContents: { send: vi.fn(), isDestroyed: () => false }
  };
  manager = new PipManager();
  manager.setMainWindow(mainWindow as never);
  manager.init();
});

afterEach(() => {
  vi.useRealTimers();
});

function finishLoad(): void {
  win.webContents.emit('did-finish-load');
}

describe('initialisation and window creation', () => {
  it('does not create a window until needed and wires the preview close handler', () => {
    manager.init();
    expect(state.windowOptions).toBeNull();

    const callback = state.preview.setClosedHandler.mock.calls[0][0] as () => void;
    callback();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('pip:previewClosed');
  });

  it('creates a frameless always-on-top window that never auto-shows', () => {
    manager.preload('/video.mp4', null);

    expect(state.windowOptions).toMatchObject({
      width: 480,
      height: 290,
      show: false,
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      autoShow: false,
      htmlFile: 'pip.html',
      icon: 'pip-icon'
    });
    expect(win.show).not.toHaveBeenCalled();
  });

  it('clears state when the window closes', () => {
    manager.init();
    manager.preload('/video.mp4', null);
    state.windowOptions.onClosed();

    expect(win.destroyed).toBe(false);
    // Po zamknięciu kolejne show tworzy nowe okno.
    const first = state.windowOptions;
    manager.show({ src: '/video.mp4' });
    expect(state.windowOptions).not.toBe(first);
  });
});

describe('preload and readiness', () => {
  it('sends video src after the renderer finishes loading', () => {
    manager.preload('/video.mp4', null);
    expect(win.webContents.send).not.toHaveBeenCalled();

    finishLoad();

    expect(win.webContents.send).toHaveBeenCalledWith('pip:videoSrc', {
      src: '/video.mp4',
      start: 0
    });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:clearSubtitle');
  });

  it('sends subtitles with the pending video and sends theme and locale', () => {
    manager.preload('/video.mp4', { subContent: 'Hello' } as never);
    finishLoad();

    expect(win.webContents.send).toHaveBeenCalledWith('pip:subtitle', { subContent: 'Hello' });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:theme', {});
    expect(win.webContents.send).toHaveBeenCalledWith('pip:locale', 'en');
  });

  it('defers show until the window is ready and then autoplays', () => {
    expect(manager.show({ src: '/video.mp4', startTime: 7, subtitle: null })).toBe(true);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 10, y: 20, width: 480, height: 290 });
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).not.toHaveBeenCalled();

    finishLoad();

    expect(win.webContents.send).toHaveBeenCalledWith('pip:videoSrc', {
      src: '/video.mp4',
      start: 0
    });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:play', 7);
  });
});

describe('show when ready', () => {
  beforeEach(() => {
    manager.preload('/video.mp4', null);
    finishLoad();
    win.webContents.send.mockClear();
  });

  it('only resumes playback for the same normalized source', () => {
    state.paths.set('/Video.MP4', '/video.mp4');
    state.paths.set('/video.mp4', '/video.mp4');

    manager.show({ src: '/Video.MP4', startTime: 3 });

    expect(win.webContents.send).toHaveBeenCalledWith('pip:play', 3);
    expect(win.webContents.send).not.toHaveBeenCalledWith('pip:videoSrc', expect.anything());
  });

  it('sends a new source and play when the source changed', () => {
    manager.show({ src: '/other.mp4', startTime: 2, subtitle: { subContent: 'x' } as never });

    expect(win.webContents.send).toHaveBeenCalledWith('pip:videoSrc', {
      src: '/other.mp4',
      start: 2
    });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:subtitle', { subContent: 'x' });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:play', 2);
  });

  it('falls back to a lowercase path when normalization fails', () => {
    state.throwOnResolve = true;
    manager.loadTrack('/initial.mp4', null);
    finishLoad();
    win.webContents.send.mockClear();

    manager.show({ src: '/Video.MP4' });

    expect(state.loggerWarn).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('pip:videoSrc', {
      src: '/Video.MP4',
      start: 0
    });
  });
});

describe('load tracking and playback', () => {
  it('loads a track, starts polling and resets the time', () => {
    manager.loadTrack('/track.mp4', null);
    finishLoad();
    win.webContents.send.mockClear();

    manager.loadTrack('/next.mp4', null);
    expect(win.webContents.send).toHaveBeenCalledWith('pip:videoSrc', {
      src: '/next.mp4',
      start: 0
    });
    expect(win.webContents.send).toHaveBeenCalledWith('pip:play', 0);

    vi.advanceTimersByTime(500);
    expect(win.webContents.send).toHaveBeenCalledWith('pip:requestTime');
  });

  it('stops polling when the window is destroyed', () => {
    manager.loadTrack('/track.mp4', null);
    finishLoad();
    vi.advanceTimersByTime(500);
    win.webContents.send.mockClear();

    win.destroyed = true;
    vi.advanceTimersByTime(500);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('updates the last reported time through IPC', () => {
    state.listeners.get('pip:timeUpdate')!({}, 42);
    expect(manager.getTime()).toBe(42);
    state.listeners.get('pip:timeUpdate')!({}, undefined);
    expect(manager.getTime()).toBe(0);
  });

  it('hides the window and pauses playback', () => {
    manager.loadTrack('/track.mp4', null);
    finishLoad();
    manager.hide();

    expect(win.webContents.send).toHaveBeenCalledWith('pip:pause');
    expect(win.hide).toHaveBeenCalled();
  });

  it('stops playback, clears the source and notifies the main window', () => {
    manager.loadTrack('/track.mp4', null);
    finishLoad();
    win.webContents.send.mockClear();
    state.listeners.get('pip:timeUpdate')!({}, 9);
    manager.stop();

    expect(win.webContents.send).toHaveBeenCalledWith('pip:clear');
    expect(win.hide).toHaveBeenCalled();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('pip:closed', 9);
  });
});

describe('subtitles and reporting', () => {
  it('ignores subtitle updates without a window', () => {
    win.destroyed = true;
    manager.updateSubtitle({ subContent: 'x' } as never);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('forwards subtitle content or clears it', () => {
    manager.loadTrack('/track.mp4', null);

    manager.updateSubtitle({ subContent: 'x' } as never);
    expect(win.webContents.send).toHaveBeenCalledWith('pip:subtitle', { subContent: 'x' });

    manager.updateSubtitle(null);
    expect(win.webContents.send).toHaveBeenCalledWith('pip:clearSubtitle');
  });

  it('reports visibility', () => {
    expect(manager.isShowing()).toBe(false);
    manager.loadTrack('/track.mp4', null);
    finishLoad();
    expect(manager.isShowing()).toBe(true);
    win.visible = false;
    expect(manager.isShowing()).toBe(false);
  });
});

describe('IPC events', () => {
  beforeEach(() => {
    manager.init();
  });

  it('hides the preview when the hidden event comes from it', () => {
    state.preview.owns.mockReturnValue(true);
    state.listeners.get('pip:hidden')!({ sender: {} });

    expect(state.preview.hide).toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('hides the PiP window and notifies on a hidden event from elsewhere', () => {
    manager.loadTrack('/track.mp4', null);
    state.listeners.get('pip:timeUpdate')!({}, 5);
    state.listeners.get('pip:hidden')!({ sender: {} });

    expect(win.hide).toHaveBeenCalled();
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('pip:closed', 5);
  });

  it('clears the loaded source and notifies when playback ends', () => {
    state.listeners.get('pip:ended')!({});
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('pip:ended');
  });

  it('stores theme and locale and forwards them to preview', () => {
    const vars = { '--accent': '#fff' };
    state.listeners.get('pip:theme')!({}, vars);
    // Renderer jeszcze nie istnieje, ale preview dostaje motyw.
    expect(state.preview.updateTheme).toHaveBeenCalledWith(vars);

    state.listeners.get('pip:locale')!({}, 'pl');
    expect(state.preview.updateLocale).toHaveBeenCalledWith('pl');
    state.listeners.get('pip:locale')!({}, '');
    expect(state.preview.updateLocale).toHaveBeenLastCalledWith('en');
  });

  it('maximizes by stopping and forwarding the current time', () => {
    manager.loadTrack('/track.mp4', null);
    finishLoad();
    win.webContents.send.mockClear();
    state.listeners.get('pip:maximize')!({}, 12);

    expect(win.webContents.send).toHaveBeenCalledWith('pip:clear');
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('pip:maximize', 12);
  });

  it('restores only when a live window exists', () => {
    expect(state.handlers.get('pip:restore')!({})).toBe(false);

    manager.loadTrack('/track.mp4', null);
    finishLoad();
    state.listeners.get('pip:timeUpdate')!({}, 8);

    expect(state.handlers.get('pip:restore')!({})).toBe(true);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('pip:restore', 8);
  });
});

describe('preview delegation and teardown', () => {
  it('shows, updates and hides the preview with the stored theme and locale', () => {
    state.listeners.get('pip:theme')!({}, { '--x': '2' });
    state.listeners.get('pip:locale')!({}, 'de');

    expect(manager.showPreview({ width: 300, height: 200 })).toBe(true);
    expect(state.preview.show).toHaveBeenCalledWith(
      { width: 300, height: 200 },
      { theme: { '--x': '2' }, locale: 'de' }
    );

    manager.updatePreview({ width: 1 });
    expect(state.preview.update).toHaveBeenCalledWith({ width: 1 });

    manager.hidePreview();
    expect(state.preview.hide).toHaveBeenCalled();
  });

  it('destroys the window, preview and IPC registrations', () => {
    manager.init();
    manager.loadTrack('/track.mp4', null);

    manager.destroy();

    expect(state.preview.destroy).toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalled();
    expect(state.listeners.has('pip:hidden')).toBe(false);
    expect(state.listeners.has('pip:timeUpdate')).toBe(false);
    expect(state.listeners.has('pip:ended')).toBe(false);
    expect(state.listeners.has('pip:theme')).toBe(false);
    expect(state.listeners.has('pip:maximize')).toBe(false);
    expect(state.listeners.has('pip:locale')).toBe(false);
    expect(state.handlers.has('pip:restore')).toBe(false);
  });
});
