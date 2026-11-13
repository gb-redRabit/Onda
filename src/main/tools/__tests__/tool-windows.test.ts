import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeWindow {
  id: number;
  destroyed: boolean;
  focus: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  moveTop: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  setAlwaysOnTop: ReturnType<typeof vi.fn>;
  setMenuBarVisibility: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
  isDestroyed: () => boolean;
  isMinimized: () => boolean;
}

const { createWindow } = vi.hoisted(() => ({
  createWindow: vi.fn()
}));

const warn = vi.hoisted(() => vi.fn());

vi.mock('../../windows/window-factory', () => ({ createWindow }));
vi.mock('../../windows/window-presets', () => ({ GLASS_WINDOW_OPTS: {} }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: { window?: FakeWindow } | null) => sender?.window ?? null
  }
}));

function fakeWindow(id: number): FakeWindow {
  const win: FakeWindow = {
    id,
    destroyed: false,
    focus: vi.fn(),
    show: vi.fn(),
    moveTop: vi.fn(),
    restore: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    webContents: { send: vi.fn() },
    isDestroyed: () => win.destroyed,
    isMinimized: () => false
  };
  return win;
}

describe('tool windows', () => {
  let openToolWindow: typeof import('../tool-windows').openToolWindow;
  let getToolWindowContext: typeof import('../tool-windows').getToolWindowContext;
  let sendToolMessageToMain: typeof import('../tool-windows').sendToolMessageToMain;
  let isToolId: typeof import('../tool-windows').isToolId;
  let getToolWindows: typeof import('../tool-windows').getToolWindows;

  beforeEach(async () => {
    vi.resetModules();
    createWindow.mockReset();
    warn.mockClear();
    const mod = await import('../tool-windows');
    openToolWindow = mod.openToolWindow;
    getToolWindowContext = mod.getToolWindowContext;
    sendToolMessageToMain = mod.sendToolMessageToMain;
    isToolId = mod.isToolId;
    getToolWindows = mod.getToolWindows;
  });

  it('opens the converter in a dedicated window with its route', () => {
    const win = fakeWindow(1);
    createWindow.mockReturnValue(win);

    expect(openToolWindow('converter', { source: 'hub' })).toBe(1);
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: '/tools/converter',
        title: 'Converter',
        width: 1000,
        height: 760
      })
    );
    expect(getToolWindowContext({ window: win } as never)).toEqual({
      toolId: 'converter',
      params: { source: 'hub' }
    });
  });

  it('owns the tool window and keeps it above the app', () => {
    const win = fakeWindow(6);
    const main = fakeWindow(99);
    createWindow.mockReturnValue(win);

    openToolWindow('converter', undefined, main as never);
    const options = createWindow.mock.calls[0]?.[0] as {
      parent?: FakeWindow;
      onReadyToShow: (window: FakeWindow) => void;
    };
    expect(options.parent).toBe(main);

    options.onReadyToShow(win);
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.moveTop).toHaveBeenCalled();
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true, 'floating');
  });

  it('focuses an existing tool window instead of creating a duplicate', () => {
    const win = fakeWindow(2);
    createWindow.mockReturnValue(win);

    expect(openToolWindow('converter')).toBe(2);
    expect(openToolWindow('converter')).toBe(2);
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalled();
  });

  it('forwards a tool message to the main window with the tool id attached', () => {
    const win = fakeWindow(3);
    const main = fakeWindow(99);
    createWindow.mockReturnValue(win);
    openToolWindow('converter');

    expect(
      sendToolMessageToMain(
        { window: win } as never,
        { type: 'conversion-complete', payload: { name: 'song.mp3' } },
        main as never
      )
    ).toBe(true);
    expect(main.webContents.send).toHaveBeenCalledWith('tools:message', {
      toolId: 'converter',
      type: 'conversion-complete',
      payload: { name: 'song.mp3' }
    });
  });

  it('rejects unknown tool ids and invalid messages', () => {
    const win = fakeWindow(4);
    const main = fakeWindow(99);
    createWindow.mockReturnValue(win);
    openToolWindow('converter');

    expect(isToolId('converter')).toBe(true);
    expect(isToolId('missing')).toBe(false);
    expect(isToolId(42)).toBe(false);
    expect(sendToolMessageToMain({ window: win } as never, null, main as never)).toBe(false);
    expect(sendToolMessageToMain({ window: win } as never, { type: '' }, main as never)).toBe(
      false
    );
    expect(
      sendToolMessageToMain({ window: fakeWindow(5) } as never, { type: 'x' }, main as never)
    ).toBe(false);
  });

  it('restores a minimized window and pushes new params to it', () => {
    const win = fakeWindow(7);
    win.isMinimized = () => true;
    createWindow.mockReturnValue(win);
    openToolWindow('converter', { a: 1 });

    expect(openToolWindow('converter', { a: 2 })).toBe(7);
    expect(win.restore).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('tools:context', {
      toolId: 'converter',
      params: { a: 2 }
    });

    openToolWindow('converter', [1, 2]);
    expect(win.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('recreates the window when the previous one was destroyed', () => {
    const first = fakeWindow(8);
    const second = fakeWindow(9);
    createWindow.mockReturnValueOnce(first).mockReturnValueOnce(second);

    openToolWindow('converter');
    first.destroyed = true;
    expect(openToolWindow('converter')).toBe(9);
    expect(createWindow).toHaveBeenCalledTimes(2);
  });

  it('skips bring-to-front for a destroyed window', () => {
    const win = fakeWindow(10);
    createWindow.mockReturnValue(win);
    openToolWindow('converter');
    const options = createWindow.mock.calls[0]?.[0] as {
      onReadyToShow: (window: FakeWindow) => void;
    };

    win.destroyed = true;
    expect(() => options.onReadyToShow(win)).not.toThrow();
    expect(win.show).not.toHaveBeenCalled();
  });

  it('drops closed windows from the registry and context', () => {
    const win = fakeWindow(11);
    createWindow.mockReturnValue(win);
    openToolWindow('converter');
    const options = createWindow.mock.calls[0]?.[0] as {
      onClosed: (window: FakeWindow) => void;
    };

    win.destroyed = true;
    options.onClosed(win);

    expect(getToolWindows()).toEqual([]);
    expect(getToolWindowContext({ window: win } as never)).toBeNull();
  });

  it('returns null when the window cannot be created', () => {
    createWindow.mockImplementationOnce(() => {
      throw new Error('no display');
    });

    expect(openToolWindow('converter')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'tools',
      "openToolWindow 'converter' failed",
      expect.any(Error)
    );
  });

  it('returns null for an unknown tool id', () => {
    expect(openToolWindow('bogus' as never)).toBeNull();
  });

  it('filters destroyed windows from the tool list', () => {
    const alive = fakeWindow(12);
    const dead = fakeWindow(13);
    createWindow.mockReturnValueOnce(alive).mockReturnValueOnce(dead);
    openToolWindow('converter');
    openToolWindow('video-clipper');

    dead.destroyed = true;

    expect(getToolWindows()).toEqual([alive]);
  });

  it('rejects messages without a main window or with a destroyed one', () => {
    const win = fakeWindow(14);
    createWindow.mockReturnValue(win);
    openToolWindow('converter');
    const sender = { window: win } as never;

    expect(sendToolMessageToMain(sender, { type: 'x' }, null)).toBe(false);
    const destroyed = fakeWindow(98);
    destroyed.destroyed = true;
    expect(sendToolMessageToMain(sender, { type: 'x' }, destroyed as never)).toBe(false);
  });

  it('omits an undefined payload and rejects windowless senders', () => {
    const win = fakeWindow(15);
    const main = fakeWindow(99);
    createWindow.mockReturnValue(win);
    openToolWindow('converter');

    expect(sendToolMessageToMain({ window: win } as never, { type: 'ping' }, main as never)).toBe(
      true
    );
    expect(main.webContents.send).toHaveBeenCalledWith('tools:message', {
      toolId: 'converter',
      type: 'ping'
    });
    expect(sendToolMessageToMain({ window: null } as never, { type: 'x' }, main as never)).toBe(
      false
    );
  });
});
