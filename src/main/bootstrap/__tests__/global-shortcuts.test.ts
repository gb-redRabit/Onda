import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const { registered, warn, fail } = vi.hoisted(() => ({
  registered: new Map<string, () => void>(),
  warn: vi.fn(),
  fail: { accelerator: '' }
}));

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string, handler: () => void) => {
      if (accelerator === fail.accelerator) throw new Error('busy');
      registered.set(accelerator, handler);
    },
    unregisterAll: () => {}
  }
}));
vi.mock('../../../shared/logger', () => ({ logger: { warn } }));

import { registerGlobalShortcuts } from '../global-shortcuts';

beforeEach(() => {
  registered.clear();
  warn.mockClear();
  fail.accelerator = '';
});

function fakeWindow(): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() }
  } as unknown as BrowserWindow;
}

describe('registerGlobalShortcuts', () => {
  it('registers the full media-key set', () => {
    registerGlobalShortcuts(() => null);
    expect([...registered.keys()].sort()).toEqual(
      [
        'MediaNextTrack',
        'MediaPlayPause',
        'MediaPreviousTrack',
        'MediaStop',
        'VolumeDown',
        'VolumeMute',
        'VolumeUp'
      ].sort()
    );
  });

  it('forwards an accelerator to the current window', () => {
    const win = fakeWindow();
    registerGlobalShortcuts(() => win);
    registered.get('MediaNextTrack')?.();
    expect(win.webContents.send).toHaveBeenCalledWith('media:next');
  });

  it('does not throw when no window exists', () => {
    registerGlobalShortcuts(() => null);
    expect(() => registered.get('MediaStop')?.()).not.toThrow();
  });

  it('skips destroyed windows and web contents', () => {
    const destroyedWindow = {
      isDestroyed: () => true,
      webContents: { isDestroyed: () => false, send: vi.fn() }
    } as unknown as BrowserWindow;
    registerGlobalShortcuts(() => destroyedWindow);
    registered.get('MediaStop')?.();
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();

    const destroyedContents = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => true, send: vi.fn() }
    } as unknown as BrowserWindow;
    registerGlobalShortcuts(() => destroyedContents);
    registered.get('MediaStop')?.();
    expect(destroyedContents.webContents.send).not.toHaveBeenCalled();
  });

  it('forwards every accelerator', () => {
    const win = fakeWindow();
    registerGlobalShortcuts(() => win);

    const expected: Record<string, string> = {
      MediaPlayPause: 'media:playPause',
      MediaNextTrack: 'media:next',
      MediaPreviousTrack: 'media:previous',
      MediaStop: 'media:stop',
      VolumeUp: 'media:volumeUp',
      VolumeDown: 'media:volumeDown',
      VolumeMute: 'media:toggleMute'
    };
    for (const [accelerator, channel] of Object.entries(expected)) {
      registered.get(accelerator)!();
      expect(win.webContents.send).toHaveBeenLastCalledWith(channel);
    }
  });

  it('logs unavailable accelerators and keeps registering the rest', () => {
    fail.accelerator = 'VolumeMute';
    registerGlobalShortcuts(() => null);

    expect(warn).toHaveBeenCalledWith(
      'main',
      'global shortcut unavailable: VolumeMute',
      expect.any(Error)
    );
    expect(registered.has('VolumeMute')).toBe(false);
    expect(registered.has('MediaPlayPause')).toBe(true);
    fail.accelerator = '';
  });
});
