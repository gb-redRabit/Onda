import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

// Pre-flight `providers:streamUrl`: przed oddaniem tokenu playerowi sprawdzamy, czy
// strumień faktycznie startuje (1 bajt). Błąd providera (np. limit) => success:false.

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  registerProviderStream: vi.fn(() => 'TOKEN')
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      h.handlers.set(ch, fn);
    }
  },
  app: { getPath: () => 'C:\\tmp\\onda' }
}));

vi.mock('../registry', () => ({
  detectProvider: vi.fn(() => null),
  getProvider: vi.fn(),
  listProviderFolder: vi.fn(async () => []),
  listProvidersRequiringAuth: vi.fn(() => []),
  resolveProviderFileUrl: vi.fn(async () => ({ url: 'http://upstream.example/x', headers: {} }))
}));

vi.mock('../../../media/media-server-stream-registry', () => ({
  registerProviderStream: h.registerProviderStream
}));

vi.mock('../../../downloads/download-manager', () => ({
  setProviderItemDownloadedHandler: vi.fn()
}));
vi.mock('../../network-target', () => ({
  resolveNetworkTarget: vi.fn(async (url: string) => ({ url, addresses: [] }))
}));
vi.mock('../../cover/cover-cache', () => ({
  getStore: vi.fn(async () => ({ get: () => undefined }))
}));
vi.mock('../remote-subs-checker', () => ({
  checkRemoteSubscriptions: vi.fn(async () => {}),
  startLinkSubsChecker: vi.fn(),
  stopLinkSubsChecker: vi.fn()
}));

import { registerProvidersHandlers } from '../providers-handlers';

registerProvidersHandlers();

const call = (channel: string, ...args: unknown[]): unknown => {
  const fn = h.handlers.get(channel);
  if (!fn) throw new Error(`handler not registered: ${channel}`);
  return fn({}, ...args);
};

const originalFetch = globalThis.fetch;

const REF = { provider: 'pikpak', shareId: 'SHARE' };

beforeEach(() => {
  h.registerProviderStream.mockClear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('providers:streamUrl — pre-flight', () => {
  it('zwraca rate-limited, gdy strumień zwraca limit (429) — bez tokenu', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
      body: null
    })) as unknown as typeof fetch;

    const res = (await call('providers:streamUrl', { ref: REF, itemId: 'f1' })) as {
      success: boolean;
      code?: string;
    };
    expect(res.success).toBe(false);
    expect(res.code).toBe('rate-limited');
    expect(h.registerProviderStream).toHaveBeenCalled();
  });

  it('zwraca streamToken, gdy strumień startuje', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === 'content-type' ? 'video/mp4' : null) },
      body: Readable.toWeb(Readable.from([Buffer.from([1])]))
    })) as unknown as typeof fetch;

    const res = (await call('providers:streamUrl', { ref: REF, itemId: 'f1' })) as {
      success: boolean;
      streamToken?: string;
    };
    expect(res.success).toBe(true);
    expect(res.streamToken).toBe('TOKEN');
  });
});
