import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createWindow: vi.fn(),
  handlers: new Map<string, (...args: any[]) => void>(),
  timers: [] as Array<() => void>
}));

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../window-factory', () => ({ createWindow: state.createWindow }));

async function load() {
  vi.resetModules();
  return import('../image-viewer-window');
}

function win(overrides: Record<string, unknown> = {}) {
  const window: any = {
    id: 7,
    isDestroyed: vi.fn(() => false),
    setAlwaysOnTop: vi.fn(),
    focus: vi.fn(),
    moveTop: vi.fn(),
    isAlwaysOnTop: vi.fn(() => false),
    webContents: { send: vi.fn() },
    setMenuBarVisibility: vi.fn(),
    close: vi.fn(),
    show: vi.fn(),
    setFullScreen: vi.fn(),
    once: vi.fn((event: string, handler: () => void) => {
      state.handlers.set(event, handler);
    }),
    ...overrides
  };
  return window;
}

beforeEach(() => {
  state.createWindow.mockReset();
  state.handlers.clear();
  state.timers = [];
  vi.useFakeTimers();
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
    state.timers.push(callback);
    return 1 as any;
  }) as any);
  state.createWindow.mockReturnValue(win());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('opening', () => {
  it('creates a fullscreen lightbox on first open', async () => {
    const viewer = await load();
    const files = [{ path: 'a.jpg' }];

    const id = viewer.openImageViewer(files, 0);

    expect(id).toBe(7);
    expect(state.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0f0f17',
        fullscreen: true,
        fullscreenable: true,
        hash: '/image-viewer'
      })
    );
    expect(state.createWindow.mock.calls[0][0].setMenuBarVisibility).toBeUndefined();
    expect(state.createWindow.mock.results[0].value.setMenuBarVisibility).toHaveBeenCalledWith(
      false
    );
    expect(viewer.getImageViewerData()).toEqual({ files, index: 0 });
  });

  it('reuses a live window and sends the new files', async () => {
    const viewer = await load();
    viewer.openImageViewer([{ path: 'a' }], 0);
    const created = state.createWindow.mock.results[0].value;
    state.createWindow.mockClear();

    const id = viewer.openImageViewer([{ path: 'b' }], 1);

    expect(id).toBe(7);
    expect(state.createWindow).not.toHaveBeenCalled();
    expect(created.webContents.send).toHaveBeenCalledWith('imageViewer:files', {
      files: [{ path: 'b' }],
      index: 1
    });
    expect(created.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(created.focus).toHaveBeenCalled();
    expect(created.moveTop).toHaveBeenCalled();
  });

  it('recreates the window when the previous one was destroyed', async () => {
    const viewer = await load();
    const first = win({ isDestroyed: vi.fn(() => true) });
    state.createWindow.mockReturnValueOnce(first).mockReturnValueOnce(win({ id: 8 }));

    viewer.openImageViewer([], 0);
    const id = viewer.openImageViewer([], 0);

    expect(state.createWindow).toHaveBeenCalledTimes(2);
    expect(id).toBe(8);
  });

  it('shows and raises the window on ready-to-show', async () => {
    const viewer = await load();
    const created = win();
    state.createWindow.mockReturnValueOnce(created);
    viewer.openImageViewer([], 0);
    const options = state.createWindow.mock.calls[0][0];

    options.onReadyToShow(created);

    expect(created.show).toHaveBeenCalledTimes(1);
    expect(created.setFullScreen).toHaveBeenCalledWith(true);
    expect(created.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(state.handlers.has('enter-full-screen')).toBe(true);

    created.setAlwaysOnTop.mockClear();
    state.handlers.get('enter-full-screen')!();
    expect(created.setAlwaysOnTop).toHaveBeenCalledTimes(1);

    created.setAlwaysOnTop.mockClear();
    state.timers.at(-1)!();
    expect(created.setAlwaysOnTop).toHaveBeenCalledTimes(1);
  });
});

describe('owner window', () => {
  it('temporarily demotes an always-on-top owner', async () => {
    const viewer = await load();
    const owner = win({ id: 1, isAlwaysOnTop: vi.fn(() => true) });
    viewer.openImageViewer([], 0, owner);

    expect(owner.setAlwaysOnTop).toHaveBeenCalledWith(false);

    state.createWindow.mock.calls[0][0].onClosed();
    expect(owner.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
  });

  it('does not demote owners that are already normal', async () => {
    const viewer = await load();
    const owner = win({ isAlwaysOnTop: vi.fn(() => false) });
    viewer.openImageViewer([], 0, owner);

    expect(owner.setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('ignores destroyed or missing owners', async () => {
    const viewer = await load();
    const owner = win({ isDestroyed: vi.fn(() => true) });

    viewer.openImageViewer([], 0, owner);
    viewer.openImageViewer([], 0, null);

    expect(owner.setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('does not restore a destroyed owner', async () => {
    const viewer = await load();
    const owner = win({ isAlwaysOnTop: vi.fn(() => true) });
    viewer.openImageViewer([], 0, owner);
    owner.isDestroyed.mockReturnValue(true);
    state.createWindow.mock.calls[0][0].onClosed();

    expect(owner.setAlwaysOnTop).toHaveBeenCalledTimes(1);
  });

  it('clears the window reference on close', async () => {
    const viewer = await load();
    viewer.openImageViewer([], 0);
    state.createWindow.mock.calls[0][0].onClosed();

    expect(viewer.getImageViewerData()).toEqual({ files: [], index: 0 });
    expect(state.createWindow).toHaveBeenCalledTimes(1);
  });
});

describe('closing', () => {
  it('closes an active viewer', async () => {
    const viewer = await load();
    const created = win();
    state.createWindow.mockReturnValueOnce(created);
    viewer.openImageViewer([], 0);

    viewer.closeImageViewer();
    expect(created.close).toHaveBeenCalledTimes(1);
  });

  it('ignores missing or destroyed viewers', async () => {
    const viewer = await load();
    expect(() => viewer.closeImageViewer()).not.toThrow();

    const created = win({ isDestroyed: vi.fn(() => true) });
    state.createWindow.mockReturnValueOnce(created);
    viewer.openImageViewer([], 0);
    viewer.closeImageViewer();

    expect(created.close).not.toHaveBeenCalled();
  });
});
