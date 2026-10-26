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

vi.mock('../../windows/window-factory', () => ({ createWindow }));
vi.mock('../../windows/window-presets', () => ({ GLASS_WINDOW_OPTS: {} }));
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

  beforeEach(async () => {
    vi.resetModules();
    createWindow.mockReset();
    const mod = await import('../tool-windows');
    openToolWindow = mod.openToolWindow;
    getToolWindowContext = mod.getToolWindowContext;
    sendToolMessageToMain = mod.sendToolMessageToMain;
    isToolId = mod.isToolId;
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

  it('owns the tool window and raises it above the app on ready', () => {
    vi.useFakeTimers();
    try {
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
      expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true);

      vi.advanceTimersByTime(250);
      expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
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
    expect(sendToolMessageToMain({ window: win } as never, null, main as never)).toBe(false);
    expect(sendToolMessageToMain({ window: win } as never, { type: '' }, main as never)).toBe(
      false
    );
    expect(
      sendToolMessageToMain({ window: fakeWindow(5) } as never, { type: 'x' }, main as never)
    ).toBe(false);
  });
});
