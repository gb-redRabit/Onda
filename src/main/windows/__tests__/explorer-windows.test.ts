import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createWindow: vi.fn(),
  warn: vi.fn(),
  opts: { transparent: true, vibrancy: 'glass' }
}));

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../window-factory', () => ({ createWindow: h.createWindow }));
vi.mock('../window-presets', () => ({ GLASS_WINDOW_OPTS: h.opts }));

import { createExplorerWindow, getExplorerWindows } from '../explorer-windows';

function fakeWindow(id: number) {
  return { id };
}

const closeCallbacks: Array<(w: { id: number }) => void> = [];

beforeEach(() => {
  for (const win of getExplorerWindows()) {
    for (const close of closeCallbacks) close(win);
  }
  closeCallbacks.length = 0;
  h.createWindow.mockReset();
  h.warn.mockClear();
});

afterEach(() => {
  for (const call of h.createWindow.mock.calls) {
    const close = (call[0] as { onClosed?: (w: { id: number }) => void }).onClosed;
    if (close) closeCallbacks.push(close);
  }
});

describe('createExplorerWindow', () => {
  it('creates a glass window without a path and registers it', () => {
    const win = fakeWindow(101);
    h.createWindow.mockReturnValue(win);

    const id = createExplorerWindow();

    expect(id).toBe(101);
    expect(h.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 400,
        show: false,
        ...h.opts,
        title: 'Explorer',
        hash: expect.stringMatching(/^\/explorer\/window\/\d+$/),
        onClosed: expect.any(Function)
      })
    );
    expect(getExplorerWindows()).toContain(win);
  });

  it('encodes the initial path in the hash', () => {
    h.createWindow.mockReturnValue(fakeWindow(102));

    createExplorerWindow('D:/Media & Stuff');

    const options = h.createWindow.mock.calls.at(-1)![0] as { hash: string };
    expect(options.hash).toMatch(/^\/explorer\/window\/\d+\?path=D%3A%2FMedia%20%26%20Stuff$/);
  });

  it('forgets a window when it closes', () => {
    const win = fakeWindow(103);
    h.createWindow.mockReturnValue(win);
    createExplorerWindow();

    const options = h.createWindow.mock.calls.at(-1)![0] as {
      onClosed: (w: { id: number }) => void;
    };
    options.onClosed(win);

    expect(getExplorerWindows()).not.toContain(win);
  });

  it('logs and returns null when window creation fails', () => {
    const error = new Error('no window');
    h.createWindow.mockImplementation(() => {
      throw error;
    });

    expect(createExplorerWindow()).toBeNull();
    expect(h.warn).toHaveBeenCalledWith('window', 'createExplorerWindow failed', error);
  });

  it('lists all open explorer windows', () => {
    const first = fakeWindow(104);
    const second = fakeWindow(105);
    h.createWindow.mockReturnValueOnce(first).mockReturnValueOnce(second);

    createExplorerWindow();
    createExplorerWindow();

    expect(getExplorerWindows()).toEqual([first, second]);
  });
});
