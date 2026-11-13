import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Manager audio PiP: okno, peek, IPC i pozycjonowanie są podstawione. Sprawdzamy
// stan (dock/preview/ready), payload `audio-pip:update` i kolejność wywołań.
const state = vi.hoisted(() => ({
  window: null as any,
  windowOptions: null as any,
  peekOptions: null as any,
  peek: {
    peeked: false,
    reset: vi.fn(),
    setMouseInside: vi.fn(),
    schedule: vi.fn(),
    cancelDelay: vi.fn(),
    unpeek: vi.fn()
  },
  createWindow: vi.fn(),
  sendToWindow: vi.fn(),
  loggerWarn: vi.fn(),
  registerIpc: vi.fn(),
  removeIpc: vi.fn(),
  computePipPosition: vi.fn((opts: Record<string, unknown>) => ({
    x: 5,
    y: 6,
    width: Number(opts.width ?? 0),
    height: Number(opts.height ?? 0)
  })),
  computeEdgePeekBounds: vi.fn(() => ({ x: 1, y: 2, width: 3, height: 4 })),
  screenListeners: new Map<string, (...args: any[]) => any>(),
  display: {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 }
  }
}));

vi.mock('electron', () => ({
  BrowserWindow: {},
  screen: {
    on: (event: string, handler: (...args: any[]) => any) => {
      state.screenListeners.set(event, handler);
    },
    removeListener: (event: string) => {
      state.screenListeners.delete(event);
    },
    getDisplayMatching: () => state.display,
    getPrimaryDisplay: () => state.display
  }
}));
vi.mock('../../../shared/types/pip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/types/pip')>();
  return {
    ...actual,
    isAudioPipEdgeDock: (dock: string) => ['top', 'bottom', 'left', 'right'].includes(dock),
    audioPipLayoutKind: (dock: string) =>
      ['top', 'bottom', 'left', 'right'].includes(dock) ? 'edge' : 'corner',
    getAudioPipSize: () => ({ width: 300, height: 80 })
  };
});
vi.mock('../pip-position', () => ({ computePipPosition: state.computePipPosition }));
vi.mock('../pip-edge-position', () => ({ computeEdgePeekBounds: state.computeEdgePeekBounds }));
vi.mock('../peek-controller', () => ({
  PeekController: function PeekController(options: unknown) {
    state.peekOptions = options;
    return state.peek;
  }
}));
vi.mock('../../windows/window-factory', () => ({
  createWindow: (options: unknown) => {
    state.windowOptions = options;
    return state.window;
  }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../utils/broadcast', () => ({ sendToWindow: state.sendToWindow }));
vi.mock('../pip-icon', () => ({ pipWindowIcon: () => 'audio-icon' }));
vi.mock('../pip-defaults', () => ({
  DEFAULT_CORNER_ELEMENTS: ['title', 'controls'],
  DEFAULT_EDGE_ELEMENTS: ['viz', 'controls'],
  PREVIEW_STATE: {
    trackName: 'Preview',
    artist: 'Artist',
    coverData: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1
  }
}));
vi.mock('../audio-pip-ipc', () => ({
  registerAudioPipIpc: (callbacks: unknown) => state.registerIpc(callbacks),
  removeAudioPipIpc: () => state.removeIpc()
}));

const { AudioPipManager } = await import('../audio-pip-manager');

function createWindow() {
  const webContents = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    isDestroyed: () => boolean;
  };
  webContents.send = vi.fn();
  webContents.isDestroyed = () => false;
  const win = Object.assign(new EventEmitter(), {
    destroyed: false,
    visible: false,
    webContents,
    isDestroyed: vi.fn(() => win.destroyed),
    isVisible: vi.fn(() => win.visible),
    setBounds: vi.fn(),
    showInactive: vi.fn(() => {
      win.visible = true;
    }),
    hide: vi.fn(() => {
      win.visible = false;
    }),
    destroy: vi.fn(() => {
      win.destroyed = true;
    }),
    setAlwaysOnTop: vi.fn()
  });
  return win;
}

let manager: InstanceType<typeof AudioPipManager>;
let win: ReturnType<typeof createWindow>;
let mainWindow: {
  isDestroyed: () => boolean;
  getBounds: () => Electron.Rectangle;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  manager = new AudioPipManager();
  win = createWindow();
  state.window = win;
  state.windowOptions = null;
  state.peek.peeked = false;
  state.peek.reset.mockClear();
  state.peek.setMouseInside.mockClear();
  state.peek.schedule.mockClear();
  state.peek.cancelDelay.mockClear();
  state.peek.unpeek.mockClear();
  state.createWindow.mockClear();
  state.sendToWindow.mockClear();
  state.loggerWarn.mockClear();
  state.registerIpc.mockClear();
  state.removeIpc.mockClear();
  state.computePipPosition.mockClear();
  state.computeEdgePeekBounds.mockClear();
  state.screenListeners.clear();
  mainWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    on: vi.fn(),
    removeListener: vi.fn()
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function createWindowOptions(): Record<string, unknown> {
  return state.windowOptions as Record<string, unknown>;
}

describe('initialisation', () => {
  it('registers IPC and screen listeners without creating a window', () => {
    manager.init();

    expect(state.registerIpc).toHaveBeenCalledTimes(1);
    expect(state.windowOptions).toBeNull();
    expect([...state.screenListeners.keys()]).toEqual([
      'display-metrics-changed',
      'display-added',
      'display-removed'
    ]);
  });

  it('creates the window on explicit prewarm', () => {
    manager.prewarm();

    expect(createWindowOptions()).toMatchObject({
      width: 300,
      height: 80,
      show: false,
      alwaysOnTop: true,
      frame: false,
      resizable: false,
      transparent: true,
      autoShow: false,
      htmlFile: 'audio-pip.html',
      icon: 'audio-icon'
    });
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  });
});

describe('show and state', () => {
  it('merges state, positions and shows the window without activation', () => {
    manager.prewarm();
    win.webContents.emit('did-finish-load');

    manager.show({
      trackName: 'Song',
      artist: 'Artist',
      coverData: 'data:image/jpeg;base64,xx',
      isPlaying: true,
      currentTime: 12,
      duration: 200,
      volume: 0.5
    });

    expect(state.peek.reset).toHaveBeenCalled();
    expect(state.peek.setMouseInside).toHaveBeenCalledWith(false);
    expect(state.peek.schedule).toHaveBeenCalled();
    expect(state.computePipPosition).toHaveBeenCalled();
    expect(win.showInactive).toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(win.webContents.send).toHaveBeenCalledWith(
      'audio-pip:update',
      expect.objectContaining({
        dock: 'bottom-right',
        layoutKind: 'corner',
        elements: ['title', 'controls'],
        edge: null,
        peeked: false,
        isPreview: false,
        state: expect.objectContaining({ trackName: 'Song', currentTime: 12 })
      })
    );
  });

  it('does not reposition an already visible window on show', () => {
    win.visible = true;
    manager.show({
      trackName: 'Song',
      artist: '',
      coverData: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1
    });
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it('updates only the visible window', () => {
    manager.prewarm();
    win.webContents.emit('did-finish-load');
    win.webContents.send.mockClear();

    manager.update({ currentTime: 5 });
    expect(win.webContents.send).not.toHaveBeenCalled();

    win.visible = true;
    manager.update({ currentTime: 6 });
    expect(win.webContents.send).toHaveBeenCalledWith(
      'audio-pip:update',
      expect.objectContaining({ state: expect.objectContaining({ currentTime: 6 }) })
    );
  });

  it('hides and stops playback', () => {
    manager.show({
      trackName: 'Song',
      artist: '',
      coverData: null,
      isPlaying: true,
      currentTime: 1,
      duration: 2,
      volume: 1
    });
    win.webContents.send.mockClear();

    manager.stop();

    expect(win.hide).toHaveBeenCalled();
    expect(state.peek.reset).toHaveBeenCalled();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('theme and layout', () => {
  it('stores and forwards the theme once the window is ready', () => {
    manager.setTheme({ '--accent': '#fff' });
    expect(win.webContents.send).not.toHaveBeenCalled();

    manager.prewarm();
    win.webContents.emit('did-finish-load');
    win.webContents.send.mockClear();
    manager.setTheme({ '--accent': '#000' });

    expect(win.webContents.send).toHaveBeenCalledWith('audio-pip:theme', { '--accent': '#000' });
  });

  it('applies a new dock, elements and autohide, resetting peek', () => {
    manager.init();
    manager.prewarm();
    win.webContents.emit('did-finish-load');
    win.visible = true;
    manager.setLayout({
      dock: 'bottom',
      edgeElements: ['viz'],
      cornerElements: ['trackInfo'],
      autoHide: false
    });
    expect(state.peek.reset).toHaveBeenCalled();
    expect(state.computeEdgePeekBounds).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith(
      'audio-pip:update',
      expect.objectContaining({
        dock: 'bottom',
        layoutKind: 'edge',
        elements: ['viz'],
        edge: 'bottom'
      })
    );
  });

  it('does not touch the window when the layout is unchanged', () => {
    manager.setDock('bottom-right');
    expect(state.computePipPosition).not.toHaveBeenCalled();
    expect(state.peek.reset).not.toHaveBeenCalled();
  });

  it('setDock delegates to setLayout', () => {
    manager.setDock('top-left');
    manager.show({
      trackName: 'Song',
      artist: '',
      coverData: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1
    });
    expect(state.computePipPosition).toHaveBeenCalledWith(
      expect.objectContaining({ position: 'top-left', width: 300, height: 80 })
    );
  });
});

describe('preview', () => {
  it('shows, updates and hides the preview', () => {
    manager.prewarm();
    win.webContents.emit('did-finish-load');

    expect(manager.showPreview({})).toBe(true);
    expect(manager.isPreviewShowing()).toBe(true);
    expect(win.showInactive).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith(
      'audio-pip:update',
      expect.objectContaining({
        isPreview: true,
        state: expect.objectContaining({ trackName: 'Preview' })
      })
    );

    win.webContents.send.mockClear();
    manager.updatePreview({ dock: 'left' });
    expect(state.computePipPosition).toHaveBeenCalled();

    manager.hidePreview();
    expect(win.hide).toHaveBeenCalled();
    expect(manager.isPreviewShowing()).toBe(false);
    expect(manager.hidePreview()).toBeUndefined();
  });

  it('does not auto-hide while the preview is open', () => {
    manager.showPreview({});
    manager.autoHideNow();
    expect(win.hide).not.toHaveBeenCalled();
  });
});

describe('window lifecycle', () => {
  it('releases a hidden window but never an active preview', () => {
    manager.prewarm();

    manager.showPreview({});
    manager.releaseWindow();
    expect(win.destroy).not.toHaveBeenCalled();

    manager.hidePreview();
    manager.releaseWindow();
    expect(win.destroy).toHaveBeenCalled();
    expect(manager.isShowing()).toBe(false);
  });

  it('notifies the main window when the native window closes', () => {
    manager.setMainWindow(mainWindow as never);
    manager.prewarm();
    (createWindowOptions().onClosed as () => void)();

    expect(state.sendToWindow).toHaveBeenCalledWith(mainWindow, 'audio-pip:closed');
  });

  it('autohides when the main window gains focus', () => {
    manager.setMainWindow(mainWindow as never);
    manager.prewarm();
    manager.show({
      trackName: 'Song',
      artist: '',
      coverData: null,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      volume: 1
    });

    const focusHandler = mainWindow.on.mock.calls[0][1] as () => void;
    focusHandler();
    expect(win.hide).toHaveBeenCalled();
  });

  it('replaces a previous focus listener when the main window changes', () => {
    const second = { isDestroyed: () => false, on: vi.fn(), removeListener: vi.fn() };
    manager.setMainWindow(mainWindow as never);
    const firstHandler = mainWindow.on.mock.calls[0][1];
    manager.setMainWindow(second as never);

    expect(mainWindow.removeListener).toHaveBeenCalledWith('focus', firstHandler);
    expect(second.on).toHaveBeenCalledTimes(1);
  });

  it('repositions on display changes only when the bounds actually moved', () => {
    manager.init();
    manager.prewarm();
    win.visible = true;
    const listener = state.screenListeners.get('display-metrics-changed')!;

    listener({}, state.display);
    const afterFirst = state.computePipPosition.mock.calls.length;
    listener({}, state.display);
    expect(state.computePipPosition.mock.calls.length).toBe(afterFirst);

    listener(
      {},
      {
        ...state.display,
        bounds: { x: 100, y: 0, width: 1920, height: 1080 }
      }
    );
    expect(state.computePipPosition.mock.calls.length).toBe(afterFirst + 1);
  });

  it('repositions when a display is added or removed', () => {
    manager.init();
    manager.prewarm();
    win.visible = true;
    const before = state.computePipPosition.mock.calls.length;

    state.screenListeners.get('display-added')!({}, state.display);
    expect(state.computePipPosition.mock.calls.length).toBe(before + 1);
    expect(state.peek.cancelDelay).toHaveBeenCalled();
  });

  it('destroys the window, listeners and IPC registrations', () => {
    manager.setMainWindow(mainWindow as never);
    manager.init();
    manager.prewarm();

    manager.destroy();

    expect(win.destroy).toHaveBeenCalled();
    expect(state.peek.cancelDelay).toHaveBeenCalled();
    expect(state.screenListeners.size).toBe(0);
    expect(state.removeIpc).toHaveBeenCalled();
  });
});

describe('audio-pip IPC callbacks', () => {
  const callbacks = () => state.registerIpc.mock.calls.at(-1)?.[0] as Record<string, any>;

  beforeEach(() => {
    manager.init();
    manager.prewarm();
    win.webContents.emit('did-finish-load');
    win.visible = true;
  });

  it('forwards time updates only when the window is visible and ready', () => {
    callbacks().onTimeUpdate({ currentTime: 30 });
    expect(win.webContents.send).toHaveBeenCalledWith(
      'audio-pip:update',
      expect.objectContaining({ state: expect.objectContaining({ currentTime: 30 }) })
    );

    win.webContents.send.mockClear();
    win.visible = false;
    callbacks().onTimeUpdate({ currentTime: 31 });
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('forwards visualizer data only when the viz element is active', () => {
    manager.setDock('bottom');
    callbacks().onVizData([1, 2, 3]);
    expect(win.webContents.send).toHaveBeenCalledWith('audio-pip:vizData', [1, 2, 3]);

    win.webContents.send.mockClear();
    manager.setDock('bottom-right');
    win.webContents.send.mockClear();
    callbacks().onVizData([4]);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('delegates theme, hover, unpeek and schedule to their targets', () => {
    callbacks().setTheme({ '--x': '1' });
    expect(win.webContents.send).toHaveBeenCalledWith('audio-pip:theme', { '--x': '1' });

    callbacks().setMouseInside(true);
    expect(state.peek.setMouseInside).toHaveBeenCalledWith(true);

    callbacks().unpeek();
    expect(state.peek.unpeek).toHaveBeenCalled();

    callbacks().schedulePeek();
    expect(state.peek.schedule).toHaveBeenCalled();
  });

  it('exposes the live preview flag and main window', () => {
    manager.showPreview({});
    expect(callbacks().isPreview()).toBe(true);
    expect(callbacks().mainWindow()).toBeNull();
  });
});

describe('peek integration and lifecycle guards', () => {
  it('reports canPeek from dock, autohide and preview state', () => {
    const options = state.peekOptions;

    manager.setDock('bottom-right');
    expect(options.canPeek()).toBe(false);

    manager.setDock('bottom');
    expect(options.canPeek()).toBe(true);

    manager.prewarm();
    manager.showPreview({});
    expect(options.canPeek()).toBe(false);
    manager.hidePreview();
    expect(options.canPeek()).toBe(true);
  });

  it('reports window visibility for the peek controller', () => {
    const options = state.peekOptions;
    manager.prewarm();
    expect(options.isWindowVisible()).toBe(false);

    win.visible = true;
    expect(options.isWindowVisible()).toBe(true);

    win.destroyed = true;
    expect(options.isWindowVisible()).toBe(false);
  });

  it('applies peeked bounds and logs failures', () => {
    const options = state.peekOptions;
    manager.setDock('bottom');
    manager.prewarm();
    state.peek.peeked = true;

    options.applyPeeked();
    expect(state.computeEdgePeekBounds).toHaveBeenCalledWith(
      expect.objectContaining({
        dock: 'bottom',
        peeked: true,
        sliver: 5,
        size: { width: 300, height: 80 }
      })
    );
    expect(win.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 });

    state.computeEdgePeekBounds.mockImplementationOnce(() => {
      throw new Error('bad bounds');
    });
    options.applyPeeked();
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'audio-pip',
      'reposition failed',
      expect.any(Error)
    );
  });

  it('skips peek positioning without a window or for corner docks', () => {
    const options = state.peekOptions;

    manager.setDock('bottom-right');
    manager.prewarm();
    const before = state.computeEdgePeekBounds.mock.calls.length;
    options.applyPeeked();
    expect(state.computeEdgePeekBounds.mock.calls.length).toBe(before);

    manager.releaseWindow();
    expect(() => options.applyPeeked()).not.toThrow();
  });

  it('pushes UI updates when peek state changes', () => {
    manager.prewarm();
    win.webContents.emit('did-finish-load');
    win.visible = true;
    state.peek.setMouseInside.mockClear();

    state.peekOptions.onChanged();

    expect(win.webContents.send).toHaveBeenCalledWith(
      'audio-pip:update',
      expect.objectContaining({ isPreview: false })
    );
  });

  it('ignores main-window focus while a preview is open', () => {
    manager.setMainWindow(mainWindow as never);
    manager.prewarm();
    manager.showPreview({});
    const focusHandler = mainWindow.on.mock.calls[0][1] as () => void;

    focusHandler();

    expect(win.hide).not.toHaveBeenCalled();
  });

  it('does not re-register the same main window', () => {
    manager.setMainWindow(mainWindow as never);
    manager.setMainWindow(mainWindow as never);

    expect(mainWindow.on).toHaveBeenCalledTimes(1);
  });

  it('clears preview timers on show, hide and destroy', () => {
    vi.useFakeTimers();
    try {
      manager.prewarm();
      (manager as unknown as { previewTimer: unknown }).previewTimer = setTimeout(() => {}, 1000);
      manager.show({
        trackName: 'Song',
        artist: '',
        coverData: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1
      });
      expect((manager as unknown as { previewTimer: unknown }).previewTimer).toBeNull();

      (manager as unknown as { previewTimer: unknown }).previewTimer = setTimeout(() => {}, 1000);
      manager.hide();
      expect((manager as unknown as { previewTimer: unknown }).previewTimer).toBeNull();

      (manager as unknown as { previewTimer: unknown }).previewTimer = setTimeout(() => {}, 1000);
      manager.destroy();
      expect((manager as unknown as { previewTimer: unknown }).previewTimer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores preview updates outside preview mode', () => {
    manager.prewarm();
    const before = state.computePipPosition.mock.calls.length;

    manager.updatePreview({ dock: 'left' });

    expect(state.computePipPosition.mock.calls.length).toBe(before);
  });

  it('skips positioning after the window is released', () => {
    manager.releaseWindow();

    expect(() => (manager as unknown as { positionWindow(): void }).positionWindow()).not.toThrow();
  });

  it('applies layout options passed to show', () => {
    manager.prewarm();
    const before = state.computeEdgePeekBounds.mock.calls.length;

    manager.show(
      {
        trackName: 'Song',
        artist: '',
        coverData: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1
      },
      { dock: 'left' }
    );

    expect(state.computeEdgePeekBounds.mock.calls.length).toBeGreaterThan(before);
    expect(win.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 });
  });
});
