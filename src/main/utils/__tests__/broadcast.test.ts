import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';

const getAllWindows = vi.hoisted(() => vi.fn(() => [] as unknown[]));

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows } }));

import { broadcastToAllWindows, sendToWindow } from '../broadcast';

interface FakeWindow {
  isDestroyed: () => boolean;
  webContents: { isDestroyed: () => boolean; send: ReturnType<typeof vi.fn> };
}

function fakeWindow(opts: { destroyed?: boolean; wcDestroyed?: boolean } = {}): FakeWindow {
  return {
    isDestroyed: () => opts.destroyed ?? false,
    webContents: {
      isDestroyed: () => opts.wcDestroyed ?? false,
      send: vi.fn()
    }
  };
}

const asWindow = (win: FakeWindow): BrowserWindow => win as unknown as BrowserWindow;

beforeEach(() => {
  vi.clearAllMocks();
  getAllWindows.mockReturnValue([]);
});

describe('sendToWindow', () => {
  it('sends to a live window and reports delivery', () => {
    const win = fakeWindow();
    expect(sendToWindow(asWindow(win), 'channel', 1)).toBe(true);
    expect(win.webContents.send).toHaveBeenCalledWith('channel', 1);
  });

  it('skips absent, destroyed windows and destroyed webContents', () => {
    expect(sendToWindow(null, 'c')).toBe(false);
    expect(sendToWindow(undefined, 'c')).toBe(false);
    expect(sendToWindow(asWindow(fakeWindow({ destroyed: true })), 'c')).toBe(false);

    const wcDead = fakeWindow({ wcDestroyed: true });
    expect(sendToWindow(asWindow(wcDead), 'c')).toBe(false);
    expect(wcDead.webContents.send).not.toHaveBeenCalled();
  });

  it('swallows a send that throws mid-teardown', () => {
    const win = fakeWindow();
    win.webContents.send.mockImplementation(() => {
      throw new Error('Object has been destroyed');
    });
    expect(sendToWindow(asWindow(win), 'c')).toBe(false);
  });
});

describe('broadcastToAllWindows', () => {
  it('delivers to every live window', () => {
    const a = fakeWindow();
    const b = fakeWindow();
    getAllWindows.mockReturnValue([a, b]);

    broadcastToAllWindows('evt', 'payload');

    expect(a.webContents.send).toHaveBeenCalledWith('evt', 'payload');
    expect(b.webContents.send).toHaveBeenCalledWith('evt', 'payload');
  });
});
