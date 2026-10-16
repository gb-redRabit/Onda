import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// Pre-flight `providers:streamUrl`: przed oddaniem tokenu playerowi sprawdzamy, czy
// strumień faktycznie startuje (1 bajt). Błąd providera (np. limit) => success:false.
// Transport idzie teraz przez `http(s).request` z przypiętym DNS (ochrona przed
// DNS-rebindingiem), więc podszywamy warstwę HTTP, a nie globalny `fetch`.

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  registerProviderStream: vi.fn(() => 'TOKEN'),
  request: vi.fn()
}));

vi.mock('node:http', () => ({ default: { request: h.request }, request: h.request }));
vi.mock('node:https', () => ({ default: { request: h.request }, request: h.request }));

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
  resolveNetworkTarget: vi.fn(async (url: string) => ({ url, addresses: [] })),
  createPinnedLookup: vi.fn(() => () => {})
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

const REF = { provider: 'pikpak', shareId: 'SHARE' };

type FakeRes = Readable & { statusCode: number; headers: Record<string, string> };

function withMeta(stream: Readable, statusCode: number, headers: Record<string, string>): FakeRes {
  const res = stream as FakeRes;
  res.statusCode = statusCode;
  res.headers = headers;
  return res;
}

// Podszywa `http(s).request`: natychmiast wywołuje callback z podaną odpowiedzią.
function fakeRequest(res: FakeRes) {
  return (_url: unknown, _opts: unknown, cb: (r: FakeRes) => void): EventEmitter => {
    const req = new EventEmitter() as EventEmitter & {
      setTimeout: () => void;
      end: () => void;
      destroy: () => void;
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    req.end = () => cb(res);
    return req;
  };
}

beforeEach(() => {
  h.registerProviderStream.mockClear();
  h.request.mockReset();
});

describe('providers:streamUrl — pre-flight', () => {
  it('zwraca rate-limited, gdy strumień zwraca limit (429) — bez tokenu', async () => {
    h.request.mockImplementation(fakeRequest(withMeta(Readable.from([]), 429, {})));

    const res = (await call('providers:streamUrl', { ref: REF, itemId: 'f1' })) as {
      success: boolean;
      code?: string;
    };
    expect(res.success).toBe(false);
    expect(res.code).toBe('rate-limited');
    expect(h.registerProviderStream).toHaveBeenCalled();
  });

  it('zwraca streamToken, gdy strumień startuje', async () => {
    h.request.mockImplementation(
      fakeRequest(
        withMeta(Readable.from([Buffer.from([1])]), 200, { 'content-type': 'video/mp4' })
      )
    );

    const res = (await call('providers:streamUrl', { ref: REF, itemId: 'f1' })) as {
      success: boolean;
      streamToken?: string;
    };
    expect(res.success).toBe(true);
    expect(res.streamToken).toBe('TOKEN');
  });
});
