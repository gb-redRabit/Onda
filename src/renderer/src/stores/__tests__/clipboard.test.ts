import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useClipboardStore } from '../clipboard';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('clipboard store', () => {
  it('starts empty', () => {
    const store = useClipboardStore();

    expect(store.items).toEqual([]);
    expect(store.action).toBeNull();
  });

  it('stores names from Windows and POSIX paths', () => {
    const store = useClipboardStore();

    store.setClipboard(['D:\\Music\\a.mp3', '/home/user/b.flac'], 'copy');

    expect(store.items).toEqual([
      { path: 'D:\\Music\\a.mp3', name: 'a.mp3' },
      { path: '/home/user/b.flac', name: 'b.flac' }
    ]);
    expect(store.action).toBe('copy');
  });

  it('falls back to the full path when it has no name part', () => {
    const store = useClipboardStore();

    store.setClipboard(['D:/'], 'cut');

    expect(store.items).toEqual([{ path: 'D:/', name: 'D:/' }]);
  });

  it('clears the clipboard', () => {
    const store = useClipboardStore();
    store.setClipboard(['D:/a'], 'cut');

    store.clear();

    expect(store.items).toEqual([]);
    expect(store.action).toBeNull();
  });

  it('detects cut entries only', () => {
    const store = useClipboardStore();

    store.setClipboard(['D:/a'], 'copy');
    expect(store.isCut('D:/a')).toBe(false);

    store.setClipboard(['D:/a'], 'cut');
    expect(store.isCut('D:/a')).toBe(true);
    expect(store.isCut('D:/b')).toBe(false);
  });
});
