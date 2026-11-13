import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handle: vi.fn(),
  getUpdaterState: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn()
}));

vi.mock('electron', () => ({ ipcMain: { handle: h.handle } }));
vi.mock('../../updater', () => ({
  getUpdaterState: h.getUpdaterState,
  checkForUpdates: h.checkForUpdates,
  downloadUpdate: h.downloadUpdate,
  installUpdate: h.installUpdate
}));

import { registerUpdaterHandlers } from '../updater-handlers';

type Handler = () => unknown;

function handler(channel: string): Handler {
  const call = h.handle.mock.calls.find(([name]) => name === channel);
  expect(call).toBeDefined();
  return call![1] as Handler;
}

beforeEach(() => {
  h.handle.mockClear();
  h.getUpdaterState.mockReset().mockReturnValue({ status: 'idle' });
  h.checkForUpdates.mockReset().mockResolvedValue({ available: true });
  h.downloadUpdate.mockReset().mockResolvedValue({ downloaded: true });
  h.installUpdate.mockReset();
});

describe('registerUpdaterHandlers', () => {
  it('registers all updater channels', () => {
    registerUpdaterHandlers();

    expect(h.handle.mock.calls.map(([name]) => name)).toEqual([
      'updater:getState',
      'updater:check',
      'updater:download',
      'updater:install'
    ]);
  });

  it('forwards state, check and download calls', async () => {
    registerUpdaterHandlers();

    expect(handler('updater:getState')()).toEqual({ status: 'idle' });
    await expect(Promise.resolve(handler('updater:check')())).resolves.toEqual({ available: true });
    await expect(Promise.resolve(handler('updater:download')())).resolves.toEqual({
      downloaded: true
    });
  });

  it('installs without returning a value', () => {
    registerUpdaterHandlers();

    expect(handler('updater:install')()).toBeUndefined();
    expect(h.installUpdate).toHaveBeenCalledTimes(1);
  });
});
