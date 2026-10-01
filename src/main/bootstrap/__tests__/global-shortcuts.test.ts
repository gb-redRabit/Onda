import { describe, it, expect, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const { registered } = vi.hoisted(() => ({
  registered: new Map<string, () => void>()
}));

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string, handler: () => void) => {
      registered.set(accelerator, handler);
    },
    unregisterAll: () => {}
  }
}));

import { registerGlobalShortcuts } from '../global-shortcuts';

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
});
