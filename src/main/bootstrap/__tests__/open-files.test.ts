import { describe, it, expect, vi } from 'vitest';
import { dirname } from 'path';
import type { BrowserWindow } from 'electron';
import { OpenFileForwarder } from '../open-files';

function fakeWindow(loading = false): BrowserWindow {
  return {
    isDestroyed: () => false,
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    webContents: { isLoading: () => loading, send: vi.fn() }
  } as unknown as BrowserWindow;
}

describe('OpenFileForwarder', () => {
  it('forwards files to a ready window and grants their folders', () => {
    const win = fakeWindow();
    const grantRoot = vi.fn();
    const forwarder = new OpenFileForwarder(() => win, grantRoot);

    forwarder.forward(['/a/b.mp3']);

    expect(grantRoot).toHaveBeenCalledWith(dirname('/a/b.mp3'));
    expect(win.webContents.send).toHaveBeenCalledWith('open-files', ['/a/b.mp3']);
  });

  it('holds files while the renderer is still loading', () => {
    const win = fakeWindow(true);
    const forwarder = new OpenFileForwarder(
      () => win,
      () => {}
    );

    forwarder.forward(['/a/b.mp3']);

    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(forwarder.takePending()).toEqual(['/a/b.mp3']);
    expect(forwarder.takePending()).toEqual([]);
  });

  it('focuses the window even when launched without files', () => {
    const win = fakeWindow();
    const forwarder = new OpenFileForwarder(
      () => win,
      () => {}
    );

    forwarder.forward([]);

    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});
