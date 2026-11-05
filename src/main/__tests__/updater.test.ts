import { beforeEach, describe, expect, it, vi } from 'vitest';

const { autoUpdater, appState } = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    appState: { packaged: false },
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeAllListeners: () => listeners.clear(),
      emit: (event: string, ...args: unknown[]) => {
        for (const listener of listeners.get(event) ?? []) listener(...args);
      },
      checkForUpdates: vi.fn(async () => ({})),
      downloadUpdate: vi.fn(async () => ({})),
      quitAndInstall: vi.fn()
    }
  };
});

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.packaged;
    },
    getVersion: () => '0.10.0'
  }
}));
vi.mock('electron-updater', () => ({ autoUpdater }));

function makeTarget() {
  return { isDestroyed: () => false, send: vi.fn() };
}

beforeEach(() => {
  vi.resetModules();
  autoUpdater.removeAllListeners();
  autoUpdater.checkForUpdates.mockClear();
  autoUpdater.downloadUpdate.mockClear();
  autoUpdater.quitAndInstall.mockClear();
  appState.packaged = false;
});

describe('auto updater', () => {
  it('does nothing in development', async () => {
    const { initAutoUpdater, getUpdaterState } = await import('../updater');
    initAutoUpdater(() => null);
    expect(getUpdaterState()).toMatchObject({ enabled: false, status: 'idle' });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('maps updater events to state and renderer messages', async () => {
    appState.packaged = true;
    const { initAutoUpdater, getUpdaterState } = await import('../updater');
    const target = makeTarget();
    initAutoUpdater(() => target as never);

    autoUpdater.emit('update-available', { version: '0.11.0' });
    expect(getUpdaterState()).toMatchObject({ status: 'available', version: '0.11.0' });
    expect(target.send).toHaveBeenCalledWith('updater:event', {
      event: 'update-available',
      version: '0.11.0'
    });

    autoUpdater.emit('download-progress', { percent: 42, bytesPerSecond: 1000 });
    expect(getUpdaterState()).toMatchObject({ status: 'downloading', progress: 42 });

    autoUpdater.emit('update-downloaded', { version: '0.11.0' });
    expect(getUpdaterState()).toMatchObject({ status: 'downloaded', progress: 100 });

    autoUpdater.emit('error', new Error('boom'));
    expect(getUpdaterState()).toMatchObject({ status: 'error', error: 'boom' });
  });

  it('checks, downloads and installs only when packaged and available', async () => {
    appState.packaged = true;
    const { initAutoUpdater, checkForUpdates, downloadUpdate, installUpdate, getUpdaterState } =
      await import('../updater');
    initAutoUpdater(() => makeTarget() as never);

    await expect(checkForUpdates()).resolves.toEqual({ checking: true });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalled();

    expect(downloadUpdate()).toBe(false);
    autoUpdater.emit('update-available', { version: '0.11.0' });
    expect(downloadUpdate()).toBe(true);
    expect(autoUpdater.downloadUpdate).toHaveBeenCalled();

    installUpdate();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
    expect(getUpdaterState().status).toBe('available');
  });

  it('replays the last event to a late renderer', async () => {
    appState.packaged = true;
    const { initAutoUpdater, replayUpdaterEvent } = await import('../updater');
    const target = makeTarget();
    initAutoUpdater(() => target as never);
    autoUpdater.emit('update-not-available');

    const late = makeTarget();
    replayUpdaterEvent(late as never);
    expect(late.send).toHaveBeenCalledWith('updater:event', { event: 'update-not-available' });
  });
});
