import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { handlers, eventHandlers, onceHandlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  eventHandlers: new Map<string, (event: unknown, ...args: unknown[]) => void>(),
  onceHandlers: new Map<string, (event: unknown, ...args: unknown[]) => void>()
}));

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    },
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      eventHandlers.set(channel, listener);
    },
    once: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
      onceHandlers.set(channel, listener);
    }
  }
}));

function trustedEvent(senderId: number | undefined = 1) {
  return {
    sender: senderId === undefined ? undefined : { id: senderId },
    senderFrame: { url: pathToFileURL(join(process.cwd(), 'out/main/index.js')).href }
  };
}

const { installIpcGuards } = await import('../guard');
installIpcGuards();

beforeEach(() => {
  handlers.clear();
  eventHandlers.clear();
  onceHandlers.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Additional guard branches: malformed frames, dev-server origins, trusted
// events and the rate-limit key for a sender without an id.

describe('IPC guard edge cases', () => {
  it('blocks a missing sender frame', async () => {
    const { ipcMain } = await import('electron');
    const listener = vi.fn();
    ipcMain.handle('edge:no-frame', listener);

    expect(() => handlers.get('edge:no-frame')?.({ senderFrame: null })).toThrow(
      'untrusted sender'
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it('blocks malformed and non-URL frames', async () => {
    const { ipcMain } = await import('electron');
    const listener = vi.fn();
    ipcMain.handle('edge:malformed', listener);

    expect(() => handlers.get('edge:malformed')?.({ senderFrame: { url: 'file:///%' } })).toThrow(
      'untrusted sender'
    );
    expect(() => handlers.get('edge:malformed')?.({ senderFrame: { url: 'not a url' } })).toThrow(
      'untrusted sender'
    );
  });

  it('allows only the configured dev-server origin for http frames', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/');
    const { ipcMain } = await import('electron');
    const listener = vi.fn(() => 'dev');
    ipcMain.handle('edge:dev', listener);

    expect(
      handlers.get('edge:dev')?.({ senderFrame: { url: 'http://localhost:5173/index.html' } })
    ).toBe('dev');
    expect(() =>
      handlers.get('edge:dev')?.({ senderFrame: { url: 'http://localhost:9999/index.html' } })
    ).toThrow('untrusted sender');
  });

  it('rejects http frames without a dev-server configuration', async () => {
    const { ipcMain } = await import('electron');
    const listener = vi.fn();
    ipcMain.handle('edge:http', listener);

    expect(() =>
      handlers.get('edge:http')?.({ senderFrame: { url: 'http://localhost:5173/' } })
    ).toThrow('untrusted sender');
  });

  it('runs trusted event and once listeners', async () => {
    const { ipcMain } = await import('electron');
    const onListener = vi.fn();
    const onceListener = vi.fn();
    ipcMain.on('edge:on', onListener);
    ipcMain.once('edge:once', onceListener);

    eventHandlers.get('edge:on')?.(trustedEvent(), 1);
    onceHandlers.get('edge:once')?.(trustedEvent(), 2);

    expect(onListener).toHaveBeenCalledWith(trustedEvent(), 1);
    expect(onceListener).toHaveBeenCalledWith(trustedEvent(), 2);
  });

  it('rate-limits a sender without an id under the unknown key', async () => {
    const { ipcMain } = await import('electron');
    const listener = vi.fn(() => true);
    ipcMain.handle('fs:delete', listener);
    const call = handlers.get('fs:delete');

    for (let i = 0; i < 20; i++) call?.(trustedEvent(undefined));
    expect(() => call?.(trustedEvent(undefined))).toThrow('rate limit');
  });
});
