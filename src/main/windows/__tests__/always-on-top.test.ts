import { describe, expect, it, vi } from 'vitest';
import { alwaysOnTopLevel, setWindowAlwaysOnTop } from '../always-on-top';

describe('alwaysOnTopLevel', () => {
  it('uses screen-saver on Windows, where floating lands behind the taskbar', () => {
    expect(alwaysOnTopLevel('win32')).toBe('screen-saver');
  });

  it('keeps floating on macOS and Linux', () => {
    expect(alwaysOnTopLevel('darwin')).toBe('floating');
    expect(alwaysOnTopLevel('linux')).toBe('floating');
  });
});

describe('setWindowAlwaysOnTop', () => {
  it('pins with the platform level and unpins without one', () => {
    const win = { setAlwaysOnTop: vi.fn() };

    setWindowAlwaysOnTop(win as never, true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, alwaysOnTopLevel());

    win.setAlwaysOnTop.mockClear();
    setWindowAlwaysOnTop(win as never, false);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });
});
