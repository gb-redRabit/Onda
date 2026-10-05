import { describe, it, expect, vi, beforeEach } from 'vitest';

const { setLoginItemSettings, getLoginItemSettings, appState } = vi.hoisted(() => ({
  setLoginItemSettings: vi.fn(),
  getLoginItemSettings: vi.fn(),
  appState: { isPackaged: true }
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getLoginItemSettings,
    setLoginItemSettings
  }
}));

import { getAutoLaunch, setAutoLaunch } from '../windows/auto-launch';

beforeEach(() => {
  setLoginItemSettings.mockReset();
  getLoginItemSettings.mockReset();
  appState.isPackaged = true;
});

describe('setAutoLaunch', () => {
  it('rejestruje wpis autostartu w spakowanej aplikacji', () => {
    const ok = setAutoLaunch({ enabled: true, hidden: true });
    expect(ok).toBe(true);
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: ['--hidden']
    });
  });

  it('nie rejestruje wpisu w dev i sprząta osierocony wpis', () => {
    appState.isPackaged = false;
    const ok = setAutoLaunch({ enabled: true, hidden: true });
    expect(ok).toBe(true);
    expect(setLoginItemSettings).toHaveBeenCalledTimes(1);
    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
    expect(setLoginItemSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ openAtLogin: true })
    );
  });

  it('zwraca false, gdy Electron rzuci wyjątek', () => {
    setLoginItemSettings.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(setAutoLaunch({ enabled: true })).toBe(false);
  });
});

describe('getAutoLaunch', () => {
  it('odczytuje enabled i hidden z args', () => {
    getLoginItemSettings.mockReturnValue({ openAtLogin: true, args: ['--hidden'] });
    expect(getAutoLaunch()).toEqual({ enabled: true, hidden: true });
  });

  it('wspiera starsze pole launchArgs', () => {
    getLoginItemSettings.mockReturnValue({ openAtLogin: true, launchArgs: ['--hidden'] });
    expect(getAutoLaunch()).toEqual({ enabled: true, hidden: true });
  });

  it('zwraca domyślne wartości przy błędzie', () => {
    getLoginItemSettings.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(getAutoLaunch()).toEqual({ enabled: false, hidden: false });
  });
});
