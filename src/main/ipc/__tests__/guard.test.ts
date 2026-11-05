import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function trustedEvent(senderId = 1) {
  return {
    sender: { id: senderId },
    senderFrame: { url: pathToFileURL(join(process.cwd(), 'out/main/index.js')).href }
  };
}

function untrustedEvent() {
  return { sender: { id: 2 }, senderFrame: { url: 'https://evil.example/' } };
}

beforeEach(() => {
  handlers.clear();
  eventHandlers.clear();
  onceHandlers.clear();
  vi.resetModules();
});

describe('IPC guard', () => {
  it('allows a trusted app frame', async () => {
    const { installIpcGuards: install } = await import('../guard');
    install();
    const listener = vi.fn(() => 'ok');
    (await import('electron')).ipcMain.handle('test:trusted', listener);
    expect(handlers.get('test:trusted')?.(trustedEvent(), 'arg')).toBe('ok');
    expect(listener).toHaveBeenCalledWith(trustedEvent(), 'arg');
  });

  it('blocks invoke, send and once from an untrusted frame', async () => {
    const { installIpcGuards: install } = await import('../guard');
    install();
    const { ipcMain } = await import('electron');
    const listener = vi.fn();
    ipcMain.handle('test:blocked', listener);
    expect(() => handlers.get('test:blocked')?.(untrustedEvent())).toThrow(
      "IPC 'test:blocked' blocked: untrusted sender"
    );

    ipcMain.on('test:on', listener);
    const event = { ...untrustedEvent(), returnValue: 'x' };
    eventHandlers.get('test:on')?.(event);
    expect(listener).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();

    ipcMain.once('test:once', listener);
    onceHandlers.get('test:once')?.(untrustedEvent());
    expect(listener).not.toHaveBeenCalled();
  });

  it('rate-limits destructive channels per sender', async () => {
    const { installIpcGuards: install } = await import('../guard');
    install();
    const { ipcMain } = await import('electron');
    const listener = vi.fn(() => true);
    ipcMain.handle('library:scan', listener);

    const call = handlers.get('library:scan');
    for (let i = 0; i < 20; i++) call?.(trustedEvent(7));
    expect(() => call?.(trustedEvent(7))).toThrow(
      "IPC 'library:scan' blocked: rate limit exceeded"
    );
    // Inny nadawca ma własny licznik.
    expect(call?.(trustedEvent(8))).toBe(true);
  });
});
