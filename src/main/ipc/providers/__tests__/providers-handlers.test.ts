import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  getPath: vi.fn(),
  request: vi.fn(),
  requests: [] as Array<{ url: any; options: any }>,
  responses: [] as any[],
  timeoutCallbacks: [] as Array<() => void>,
  detectProvider: vi.fn(),
  getProvider: vi.fn(),
  listProviderFolder: vi.fn(),
  listProvidersRequiringAuth: vi.fn(),
  resolveProviderFileUrl: vi.fn(),
  sanitizeRef: vi.fn(),
  addRemoteSubscription: vi.fn(),
  loadRemoteSubscriptions: vi.fn(),
  removeRemoteSubscription: vi.fn(),
  updateRemoteSubscription: vi.fn(),
  loadProviderDownloaded: vi.fn(),
  markProviderDownloaded: vi.fn(),
  setDownloadedHandler: vi.fn(),
  registerProviderStream: vi.fn(),
  detectProviderLimit: vi.fn(),
  classifyYtDlpError: vi.fn(),
  getStore: vi.fn(),
  hasProviderCookie: vi.fn(),
  setProviderCookie: vi.fn(),
  clearProviderCookie: vi.fn(),
  startProviderLogin: vi.fn(),
  listLoginProviderIds: vi.fn(),
  checkRemoteSubscriptions: vi.fn(),
  looksExpired: vi.fn(),
  startLinkSubsChecker: vi.fn(),
  stopLinkSubsChecker: vi.fn(),
  resolveNetworkTarget: vi.fn(),
  createPinnedLookup: vi.fn(),
  e2e: false,
  e2eDetect: vi.fn(),
  e2eList: vi.fn(),
  e2eAuthList: vi.fn(),
  e2eDownloaded: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({
  app: { getPath: state.getPath },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  }
}));
vi.mock('node:path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:path')>()),
  join: (...parts: string[]) => parts.join('/')
}));
vi.mock('node:http', () => ({ default: { request: state.request } }));
vi.mock('node:https', () => ({ default: { request: state.request } }));
vi.mock('node:stream', () => ({ Readable: class {} }));
vi.mock('../../../../shared/logger', () => ({
  logger: { info: state.info, warn: state.warn, error: vi.fn() }
}));
vi.mock('../../../e2e-fixtures', () => ({
  e2eFixturesEnabled: () => state.e2e,
  e2eProviderDetect: state.e2eDetect,
  e2eProviderList: state.e2eList,
  e2eProviderAuthList: state.e2eAuthList,
  e2eProviderDownloaded: state.e2eDownloaded
}));
vi.mock('../../../downloads/error-classifier', () => ({
  classifyYtDlpError: state.classifyYtDlpError
}));
vi.mock('../../network-target', () => ({
  resolveNetworkTarget: state.resolveNetworkTarget,
  createPinnedLookup: state.createPinnedLookup
}));
vi.mock('../registry', () => ({
  detectProvider: state.detectProvider,
  getProvider: state.getProvider,
  listProviderFolder: state.listProviderFolder,
  listProvidersRequiringAuth: state.listProvidersRequiringAuth,
  resolveProviderFileUrl: state.resolveProviderFileUrl
}));
vi.mock('../remote-subs-store', () => ({
  sanitizeProviderRef: state.sanitizeRef,
  addRemoteSubscription: state.addRemoteSubscription,
  loadRemoteSubscriptions: state.loadRemoteSubscriptions,
  removeRemoteSubscription: state.removeRemoteSubscription,
  updateRemoteSubscription: state.updateRemoteSubscription
}));
vi.mock('../providers-downloaded-store', () => ({
  loadProviderDownloaded: state.loadProviderDownloaded,
  markProviderDownloaded: state.markProviderDownloaded
}));
vi.mock('../../../downloads/download-manager', () => ({
  setProviderItemDownloadedHandler: state.setDownloadedHandler
}));
vi.mock('../../../media/media-server-stream-registry', () => ({
  registerProviderStream: state.registerProviderStream
}));
vi.mock('../provider-limits', () => ({ detectProviderLimit: state.detectProviderLimit }));
vi.mock('../../cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('../provider-credentials', () => ({
  hasProviderCookie: state.hasProviderCookie,
  setProviderCookie: state.setProviderCookie,
  clearProviderCookie: state.clearProviderCookie
}));
vi.mock('../provider-login', () => ({
  startProviderLogin: state.startProviderLogin,
  listLoginProviderIds: state.listLoginProviderIds
}));
vi.mock('../remote-subs-checker', () => ({
  checkRemoteSubscriptions: state.checkRemoteSubscriptions,
  looksExpired: state.looksExpired,
  startLinkSubsChecker: state.startLinkSubsChecker,
  stopLinkSubsChecker: state.stopLinkSubsChecker
}));

async function load() {
  vi.resetModules();
  const module = await import('../providers-handlers');
  module.registerProvidersHandlers();
  return { handlers: state.handlers, module };
}

function providerRef(overrides: Record<string, unknown> = {}) {
  return { provider: 'pikpak', shareId: 'share', ...overrides };
}

function response(spec: Record<string, unknown> = {}) {
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.headers = {};
  res.resume = vi.fn();
  res.destroy = vi.fn();
  Object.assign(res, spec);
  return res;
}

function queueResponse(spec: Record<string, unknown> = {}) {
  const res = response(spec);
  state.responses.push(res);
  return res;
}

function stream() {
  const s = new EventEmitter() as any;
  s.destroy = vi.fn();
  return s;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

beforeEach(() => {
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.requests = [];
  state.responses = [];
  state.timeoutCallbacks = [];
  state.e2e = false;
  state.getPath.mockReturnValue('C:/userData');
  state.request.mockImplementation((url: any, options: any, callback: (res: any) => void) => {
    state.requests.push({ url, options });
    const req = new EventEmitter() as any;
    req.setTimeout = (_ms: number, callback2: () => void) => {
      state.timeoutCallbacks.push(callback2);
    };
    req.destroy = (error?: Error) => {
      if (error) req.emit('error', error);
    };
    req.end = () => {
      const res = state.responses.shift() ?? response();
      queueMicrotask(() => callback(res));
    };
    return req;
  });
  state.resolveNetworkTarget.mockImplementation(async (url: string) => ({
    url: new URL(url),
    addresses: ['1.2.3.4']
  }));
  state.createPinnedLookup.mockReturnValue('lookup');
  state.classifyYtDlpError.mockReturnValue('classified');
  state.detectProviderLimit.mockReturnValue({ limited: false });
  state.detectProvider.mockReturnValue({ id: 'pikpak', label: 'PikPak', ref: providerRef() });
  state.getProvider.mockReturnValue({ id: 'gdrive', label: 'Google Drive', icon: 'gdrive' });
  state.sanitizeRef.mockReturnValue(providerRef());
  state.listProviderFolder.mockResolvedValue([{ id: 'item' }]);
  state.listProvidersRequiringAuth.mockReturnValue([
    { id: 'pikpak', label: 'PikPak', icon: 'pikpak' }
  ]);
  state.listLoginProviderIds.mockReturnValue(['gdrive']);
  state.hasProviderCookie.mockResolvedValue(true);
  state.setProviderCookie.mockResolvedValue(true);
  state.clearProviderCookie.mockResolvedValue(true);
  state.startProviderLogin.mockResolvedValue({ success: true });
  state.loadRemoteSubscriptions.mockResolvedValue([{ id: 's1', ref: providerRef() }]);
  state.addRemoteSubscription.mockResolvedValue({ id: 'new' });
  state.removeRemoteSubscription.mockResolvedValue(true);
  state.updateRemoteSubscription.mockResolvedValue({ id: 's1', status: 'ok' });
  state.loadProviderDownloaded.mockResolvedValue(['item']);
  state.markProviderDownloaded.mockResolvedValue(undefined);
  state.registerProviderStream.mockReturnValue('stream-token');
  state.getStore.mockResolvedValue({ get: () => undefined });
  state.e2eDetect.mockReturnValue({ id: 'e2e' });
  state.e2eList.mockReturnValue([{ id: 'e2e-item' }]);
  state.e2eAuthList.mockReturnValue([{ id: 'e2e-auth' }]);
  state.e2eDownloaded.mockReturnValue(['e2e-downloaded']);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registration and scheduler', () => {
  it('registers handlers and the downloaded callback', async () => {
    await load();
    expect(state.setDownloadedHandler).toHaveBeenCalled();
    const callback = state.setDownloadedHandler.mock.calls[0][0];
    callback('', providerRef({ provider: 'pikpak' }), 'item1');
    await flush();
    expect(state.markProviderDownloaded).toHaveBeenCalledWith(
      'C:/userData/providers-downloaded.json',
      'pikpak',
      'share',
      ['item1']
    );

    callback('explicit', providerRef(), 'item2');
    await flush();
    expect(state.markProviderDownloaded).toHaveBeenLastCalledWith(
      'C:/userData/providers-downloaded.json',
      'explicit',
      'share',
      ['item2']
    );
    expect(Object.keys(state.handlers)).toEqual(
      expect.arrayContaining([
        'providers:detect',
        'providers:list',
        'providers:auth:list',
        'providers:cred:get',
        'providers:cred:set',
        'providers:cred:clear',
        'providers:cred:login',
        'providers:downloaded',
        'providers:subs:list',
        'providers:streamUrl',
        'providers:subs:add',
        'providers:subs:remove',
        'providers:subs:update',
        'providers:subs:check',
        'providers:subs:checkAll'
      ])
    );
  });

  it('starts and stops the auto-check scheduler', async () => {
    state.getStore.mockResolvedValue({
      get: () => ({ autoCheckLinkSubscriptions: true })
    });
    const { module } = await load();
    await module.syncLinkSubsScheduler();
    expect(state.startLinkSubsChecker).toHaveBeenCalledWith(
      'C:/userData/remote-subscriptions.json'
    );

    state.getStore.mockResolvedValue({ get: () => ({}) });
    await module.syncLinkSubsScheduler();
    expect(state.stopLinkSubsChecker).toHaveBeenCalled();

    state.getStore.mockRejectedValue(new Error('store'));
    await module.syncLinkSubsScheduler();
    expect(state.stopLinkSubsChecker).toHaveBeenCalledTimes(2);
  });
});

describe('detect, list and credentials', () => {
  it('detects providers and uses e2e fixtures when enabled', async () => {
    const h = (await load()).handlers;
    expect(await h['providers:detect']({}, 'https://mega.nz/x')).toEqual({
      id: 'pikpak',
      label: 'PikPak',
      ref: providerRef()
    });
    expect(state.detectProvider).toHaveBeenCalledWith('https://mega.nz/x');

    await h['providers:detect']({}, 5);
    expect(state.detectProvider).toHaveBeenLastCalledWith(5);

    state.e2e = true;
    expect(await h['providers:detect']({}, 'https://e2e')).toEqual({ id: 'e2e' });
    expect(state.e2eDetect).toHaveBeenCalledWith('https://e2e');
  });

  it('lists folders with options and e2e fixtures', async () => {
    const h = (await load()).handlers;
    const result = await h['providers:list'](
      {},
      {
        ref: providerRef(),
        folderId: 'folder',
        force: true
      }
    );
    expect(result).toEqual({ success: true, items: [{ id: 'item' }] });
    expect(state.listProviderFolder).toHaveBeenCalledWith(providerRef(), 'folder', true);

    await h['providers:list']({}, { ref: providerRef(), folderId: 5, force: false });
    expect(state.listProviderFolder).toHaveBeenLastCalledWith(providerRef(), undefined, false);

    await h['providers:list']({}, undefined);
    expect(state.listProviderFolder).toHaveBeenLastCalledWith(providerRef(), undefined, false);

    state.e2e = true;
    expect(await h['providers:list']({}, { folderId: 'e2e-folder' })).toEqual({
      success: true,
      items: [{ id: 'e2e-item' }]
    });
    expect(state.e2eList).toHaveBeenCalledWith('e2e-folder');
    await h['providers:list']({}, undefined);
    expect(state.e2eList).toHaveBeenLastCalledWith(undefined);
  });

  it('rejects invalid refs and reports list failures', async () => {
    const h = (await load()).handlers;
    state.sanitizeRef.mockReturnValueOnce(null);
    expect(await h['providers:list']({}, {})).toEqual({
      success: false,
      error: 'Invalid provider ref',
      items: []
    });

    state.listProviderFolder.mockRejectedValueOnce(new Error('rate limited'));
    expect(await h['providers:list']({}, { ref: providerRef() })).toEqual({
      success: false,
      error: 'rate limited',
      code: 'classified',
      items: []
    });

    state.listProviderFolder.mockRejectedValueOnce('boom');
    expect(await h['providers:list']({}, { ref: providerRef() })).toMatchObject({
      success: false,
      error: 'boom'
    });
  });

  it('merges required and optional providers with cookie state', async () => {
    const h = (await load()).handlers;
    expect(await h['providers:auth:list']()).toEqual([
      { id: 'pikpak', label: 'PikPak', icon: 'pikpak', required: true, hasCookie: true },
      { id: 'gdrive', label: 'Google Drive', icon: 'gdrive', required: false, hasCookie: true }
    ]);
    expect(state.getProvider).toHaveBeenCalledWith('gdrive');

    state.listLoginProviderIds.mockReturnValueOnce(['pikpak', 'missing']);
    state.getProvider.mockReturnValueOnce(undefined);
    expect(await h['providers:auth:list']()).toHaveLength(1);

    state.e2e = true;
    expect(await h['providers:auth:list']()).toEqual([{ id: 'e2e-auth' }]);
  });

  it('reads, writes, clears and logs in provider credentials', async () => {
    const h = (await load()).handlers;
    expect(await h['providers:cred:get']({}, 'pikpak')).toEqual({ hasCookie: true });
    expect(await h['providers:cred:get']({}, 5)).toEqual({ hasCookie: false });

    expect(await h['providers:cred:set']({}, { providerId: 'pikpak', cookie: 'c' })).toBe(true);
    expect(state.setProviderCookie).toHaveBeenCalledWith('pikpak', 'c');
    expect(await h['providers:cred:set']({}, { providerId: 'pikpak' })).toBe(false);
    expect(await h['providers:cred:set']({}, null)).toBe(false);

    expect(await h['providers:cred:clear']({}, 'pikpak')).toBe(true);
    expect(await h['providers:cred:clear']({}, 5)).toBe(false);

    expect(await h['providers:cred:login']({}, 'pikpak')).toEqual({ success: true });
    expect(await h['providers:cred:login']({}, 5)).toEqual({
      success: false,
      error: 'Invalid provider'
    });
  });

  it('loads downloaded ids with validation and e2e fixtures', async () => {
    const h = (await load()).handlers;
    expect(await h['providers:downloaded']({}, { provider: 'pikpak', shareId: 's' })).toEqual([
      'item'
    ]);
    expect(await h['providers:downloaded']({}, { provider: 'pikpak' })).toEqual([]);
    expect(await h['providers:downloaded']({}, null)).toEqual([]);

    state.e2e = true;
    expect(await h['providers:downloaded']({}, {})).toEqual(['e2e-downloaded']);
  });
});

describe('subscriptions', () => {
  it('lists adds removes and updates subscriptions', async () => {
    const h = (await load()).handlers;
    expect(await h['providers:subs:list']()).toEqual([{ id: 's1', ref: providerRef() }]);

    expect(
      await h['providers:subs:add']({}, { url: ' https://mega.nz/x ', title: 'Custom' })
    ).toEqual({ id: 'new' });
    expect(state.addRemoteSubscription).toHaveBeenCalledWith(
      'C:/userData/remote-subscriptions.json',
      { url: 'https://mega.nz/x', title: 'Custom' },
      'pikpak',
      providerRef()
    );

    await h['providers:subs:add']({}, { url: 'https://mega.nz/x' });
    expect(state.addRemoteSubscription).toHaveBeenLastCalledWith(
      'C:/userData/remote-subscriptions.json',
      { url: 'https://mega.nz/x', title: 'PikPak' },
      'pikpak',
      providerRef()
    );

    expect(await h['providers:subs:add']({}, { url: '  ' })).toBeNull();
    expect(await h['providers:subs:add']({}, null)).toBeNull();
    state.detectProvider.mockReturnValueOnce(null);
    expect(await h['providers:subs:add']({}, { url: 'https://x' })).toBeNull();

    expect(await h['providers:subs:remove']({}, 's1')).toBe(true);
    expect(state.removeRemoteSubscription).toHaveBeenCalledWith(
      'C:/userData/remote-subscriptions.json',
      's1'
    );

    expect(await h['providers:subs:update']({}, 's1', { title: 'T' })).toEqual({
      id: 's1',
      status: 'ok'
    });
  });

  it('checks a subscription and records ok, expired or error', async () => {
    const h = (await load()).handlers;
    expect(await h['providers:subs:check']({}, 's1')).toEqual({ id: 's1', status: 'ok' });
    expect(state.listProviderFolder).toHaveBeenCalledWith(providerRef(), undefined, true);
    expect(state.updateRemoteSubscription).toHaveBeenCalledWith(
      'C:/userData/remote-subscriptions.json',
      's1',
      expect.objectContaining({ status: 'ok', lastCheckedAt: expect.any(Number) })
    );

    expect(await h['providers:subs:check']({}, 'missing')).toBeNull();

    state.listProviderFolder.mockRejectedValueOnce(new Error('expired'));
    state.looksExpired.mockReturnValueOnce(true);
    await h['providers:subs:check']({}, 's1');
    expect(state.updateRemoteSubscription).toHaveBeenLastCalledWith(
      'C:/userData/remote-subscriptions.json',
      's1',
      expect.objectContaining({ status: 'expired' })
    );

    state.listProviderFolder.mockRejectedValueOnce('boom');
    state.looksExpired.mockReturnValueOnce(false);
    await h['providers:subs:check']({}, 's1');
    expect(state.updateRemoteSubscription).toHaveBeenLastCalledWith(
      'C:/userData/remote-subscriptions.json',
      's1',
      expect.objectContaining({ status: 'error' })
    );
  });

  it('checks all subscriptions and returns the refreshed list', async () => {
    const h = (await load()).handlers;
    state.loadRemoteSubscriptions.mockResolvedValueOnce([{ id: 'fresh' }]);
    expect(await h['providers:subs:checkAll']()).toEqual([{ id: 'fresh' }]);
    expect(state.checkRemoteSubscriptions).toHaveBeenCalledWith(
      'C:/userData/remote-subscriptions.json'
    );
  });
});

describe('streamUrl', () => {
  it('rejects invalid requests', async () => {
    const h = (await load()).handlers;
    state.sanitizeRef.mockReturnValueOnce(null);
    expect(await h['providers:streamUrl']({}, {})).toEqual({
      success: false,
      error: 'Invalid request'
    });

    expect(await h['providers:streamUrl']({}, { ref: providerRef() })).toEqual({
      success: false,
      error: 'Invalid request'
    });
    expect(await h['providers:streamUrl']({}, { ref: providerRef(), itemId: '' })).toEqual({
      success: false,
      error: 'Invalid request'
    });
  });

  it('registers a URL factory and probes the stream', async () => {
    const h = (await load()).handlers;
    const res = queueResponse({ headers: { 'content-type': 'video/mp4' } });
    state.resolveProviderFileUrl.mockResolvedValue({
      url: 'https://cdn.example/video.mp4',
      headers: { Referer: 'https://provider' }
    });

    const pending = h['providers:streamUrl'](
      {},
      { ref: providerRef(), itemId: 'item', mime: 'video/mp4' }
    );
    await flush();
    res.emit('data', Buffer.from('a'));
    await expect(pending).resolves.toEqual({ success: true, streamToken: 'stream-token' });

    const factory = state.registerProviderStream.mock.calls[0][0];
    expect(state.requests[0].options).toMatchObject({
      method: 'GET',
      lookup: 'lookup',
      headers: { Referer: 'https://provider', Range: 'bytes=0-1' }
    });

    const fullRes = queueResponse({
      headers: { 'content-type': 'application/octet-stream' }
    });
    const result = await factory({ start: 10, end: 20 });
    expect(result).toMatchObject({
      mime: 'video/mp4',
      stream: fullRes
    });
    expect(state.requests[1].options.headers).toMatchObject({
      Referer: 'https://provider',
      Range: 'bytes=10-20'
    });
  });

  it('reports provider limits from preflight failures', async () => {
    const h = (await load()).handlers;
    state.resolveProviderFileUrl.mockResolvedValue({ url: 'https://cdn.example/video.mp4' });
    state.detectProviderLimit.mockReturnValue({ limited: true });
    state.request.mockImplementationOnce((_url: any, _options: any, callback: any) => {
      const req = new EventEmitter() as any;
      req.setTimeout = () => {};
      req.destroy = (error?: Error) => {
        if (error) req.emit('error', error);
      };
      req.end = () => {
        const res = response({ statusCode: 403, headers: {} });
        queueMicrotask(() => callback(res));
      };
      return req;
    });

    await expect(
      h['providers:streamUrl']({}, { ref: providerRef(), itemId: 'item' })
    ).resolves.toEqual({
      success: false,
      error: 'HTTP 403',
      code: 'rate-limited'
    });
    expect(state.detectProviderLimit).toHaveBeenCalledWith('HTTP 403');
  });

  it('builds stream factories with ranged re-resolution', async () => {
    const h = (await load()).handlers;
    const signal = stream();
    const freshStream = stream();
    const fresh = { stream: freshStream, size: 50 };
    let resolveCalls = 0;
    state.resolveProviderFileUrl.mockImplementation(async () =>
      resolveCalls++ === 0 ? { stream: signal, size: 100 } : fresh
    );

    const pending = h['providers:streamUrl'](
      {},
      { ref: providerRef(), itemId: 'item', mime: 'audio/flac' }
    );
    await vi.waitFor(() => expect(freshStream.listenerCount('data')).toBeGreaterThan(0));
    freshStream.emit('data', Buffer.from('a'));
    await expect(pending).resolves.toEqual({ success: true, streamToken: 'stream-token' });
    expect(signal.destroy).toHaveBeenCalled();

    const factory = state.registerProviderStream.mock.calls[0][0];
    await expect(factory({ start: 5, end: 9 })).resolves.toEqual({
      stream: freshStream,
      mime: 'audio/flac',
      size: 50
    });
    expect(state.resolveProviderFileUrl).toHaveBeenLastCalledWith('pikpak', providerRef(), 'item', {
      start: 5,
      end: 9
    });
  });

  it('rejects stream factories that lose their stream', async () => {
    const h = (await load()).handlers;
    state.resolveProviderFileUrl.mockResolvedValueOnce({ stream: stream() });
    state.resolveProviderFileUrl.mockResolvedValueOnce({});

    await expect(
      h['providers:streamUrl']({}, { ref: providerRef(), itemId: 'item' })
    ).resolves.toEqual({
      success: false,
      error: 'Brak strumienia providera',
      code: 'classified'
    });
  });

  it('reports unsupported file responses', async () => {
    const h = (await load()).handlers;
    state.resolveProviderFileUrl.mockResolvedValue({});
    expect(await h['providers:streamUrl']({}, { ref: providerRef(), itemId: 'item' })).toEqual({
      success: false,
      error: 'Nie można odtworzyć tego pliku'
    });
  });

  it('reports resolution failures', async () => {
    const h = (await load()).handlers;
    state.resolveProviderFileUrl.mockRejectedValue(new Error('resolve failed'));
    expect(await h['providers:streamUrl']({}, { ref: providerRef(), itemId: 'item' })).toEqual({
      success: false,
      error: 'resolve failed'
    });

    state.resolveProviderFileUrl.mockRejectedValueOnce('plain');
    expect(await h['providers:streamUrl']({}, { ref: providerRef(), itemId: 'item' })).toEqual({
      success: false,
      error: 'plain'
    });
  });

  it('falls back to the octet-stream mime without hints', async () => {
    const { module } = await load();
    queueResponse({ headers: {} });
    const result = await module.openHttpStream(
      'https://cdn.example/file',
      {},
      { start: 0 },
      undefined
    );
    expect(result.mime).toBe('application/octet-stream');
    expect(result.stream).toBeDefined();
    expect(state.requests[0].options.headers.Range).toBe('bytes=0-');
  });
});

describe('openHttpStream', () => {
  it('follows same-origin redirects and keeps headers', async () => {
    const { module } = await load();
    queueResponse({ statusCode: 302, headers: { location: '/next' } });
    const final = queueResponse({
      headers: { 'content-type': 'audio/flac', 'content-range': 'bytes 0-9/1234' }
    });

    const result = await module.openHttpStream('https://cdn.example/a', { Cookie: 'c' });
    expect(state.requests).toHaveLength(2);
    expect(state.requests[1].options.headers).toEqual({ Cookie: 'c' });
    expect(state.requests[1].url.toString()).toBe('https://cdn.example/next');
    expect(result).toMatchObject({ stream: final, mime: 'audio/flac', size: 1234 });
  });

  it('drops credentials on cross-origin redirects', async () => {
    const { module } = await load();
    queueResponse({ statusCode: 301, headers: { location: 'https://other.example/x' } });
    queueResponse({ headers: { 'content-length': '99' } });

    const result = await module.openHttpStream('https://cdn.example/a', {
      Cookie: 'c',
      Referer: 'r'
    });
    expect(state.requests[1].options.headers).toEqual({});
    expect(result.mime).toBe('application/octet-stream');
    expect(result.size).toBe(99);
  });

  it('fails on too many redirects and HTTP errors', async () => {
    const { module } = await load();
    for (let i = 0; i < 6; i += 1) {
      queueResponse({ statusCode: 302, headers: { location: '/loop' } });
    }
    await expect(module.openHttpStream('https://cdn.example/a', {})).rejects.toThrow(
      'Too many redirects'
    );
    expect(state.requests).toHaveLength(6);

    queueResponse({ statusCode: 404, headers: {} });
    await expect(module.openHttpStream('https://cdn.example/b', {})).rejects.toThrow('HTTP 404');
  });

  it('accepts partial content and prefers upstream media types', async () => {
    const { module } = await load();
    const partial = queueResponse({
      statusCode: 206,
      headers: { 'content-type': 'IMAGE/PNG', 'content-length': '10' }
    });
    const result = await module.openHttpStream(
      'https://cdn.example/img',
      {},
      undefined,
      'video/mp4'
    );
    expect(result.mime).toBe('IMAGE/PNG');
    expect(result.stream).toBe(partial);
  });

  it('rejects on request errors and timeouts', async () => {
    const { module } = await load();
    state.request.mockImplementationOnce(() => {
      const req = new EventEmitter() as any;
      req.setTimeout = (_ms: number, callback: () => void) => {
        state.timeoutCallbacks.push(callback);
      };
      req.destroy = (error?: Error) => {
        if (error) req.emit('error', error);
      };
      req.end = () => {};
      return req;
    });

    const pending = module.openHttpStream('https://cdn.example/a', {});
    await flush();
    state.timeoutCallbacks[0]();
    await expect(pending).rejects.toThrow('upstream timeout');
  });

  it('falls back to a placeholder hostname in logs for invalid URLs', async () => {
    const { module } = await load();
    state.resolveNetworkTarget.mockResolvedValueOnce({
      url: new URL('https://valid.example'),
      addresses: []
    });
    state.request.mockImplementationOnce((_url: any, _options: any, callback: any) => {
      const req = new EventEmitter() as any;
      req.setTimeout = () => {};
      req.destroy = () => {};
      req.end = () => {
        const res = response();
        queueMicrotask(() => callback(res));
      };
      return req;
    });
    await module.openHttpStream('not a url', {});
    expect(state.info).toHaveBeenCalledWith('providers', expect.stringContaining('host=?'));
  });
});
