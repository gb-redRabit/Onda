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
    forwarder.takePending(); // renderer zgłosił gotowość

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

  // Regresja: `forward` dopisywał ścieżki do `pending` NAWET gdy wysyłał je przez
  // `send`, więc po przeładowaniu renderera `app:getPendingFiles` odtwarzał już
  // dostarczone pliki (pamięć rosła, plik otwierał się drugi raz).
  it('does not replay delivered files after takePending', () => {
    const win = fakeWindow();
    const forwarder = new OpenFileForwarder(
      () => win,
      () => {}
    );
    forwarder.takePending();
    forwarder.forward(['/a/b.mp3']);

    expect(win.webContents.send).toHaveBeenCalledTimes(1);
    expect(forwarder.takePending()).toEqual([]);
  });

  it('re-buffers events while the renderer reloads', () => {
    const win = fakeWindow();
    const forwarder = new OpenFileForwarder(
      () => win,
      () => {}
    );
    forwarder.takePending();
    forwarder.resetListening(); // reload startuje

    forwarder.forward(['/c/d.mp3']);

    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(forwarder.takePending()).toEqual(['/c/d.mp3']);
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
