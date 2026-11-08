import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';

interface ResponseSpec {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  resError?: boolean;
  reqError?: boolean;
  timeout?: boolean;
}

const state = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:/user'),
  appOn: vi.fn(),
  fromPartition: vi.fn(),
  beforeRequest: null as any,
  contentsOn: vi.fn(),
  getType: vi.fn(() => 'webview'),
  getURL: vi.fn(() => 'https://page.example/watch'),
  insertCSS: vi.fn(async () => undefined),
  executeJS: vi.fn(async (_script: string, _userGesture?: boolean) => undefined),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  httpsGet: vi.fn(),
  responses: [] as ResponseSpec[],
  requestUrls: [] as string[],
  parseFilterList: vi.fn(),
  matchNetwork: vi.fn(),
  cosmeticCssFor: vi.fn(() => '.cosmetic{display:none}'),
  scriptletsFor: vi.fn(),
  hostOf: vi.fn(() => 'page.example'),
  filterSet: { network: [] as unknown[], cosmetic: [], scriptlets: [] },
  matchesFilters: false,
  scriptlets: [] as { name: string; args: string[] }[]
}));

vi.mock('electron', () => ({
  app: { getPath: state.getPath, on: state.appOn },
  session: { fromPartition: state.fromPartition }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: state.loggerWarn, error: vi.fn() }
}));
vi.mock('fs/promises', () => ({
  stat: state.stat,
  readFile: state.readFile,
  writeFile: state.writeFile
}));
vi.mock('https', () => ({ default: { get: state.httpsGet } }));
vi.mock('../adblock-filters', () => ({
  parseFilterList: state.parseFilterList,
  matchNetwork: state.matchNetwork,
  cosmeticCssFor: state.cosmeticCssFor,
  scriptletsFor: state.scriptletsFor,
  hostOf: state.hostOf
}));

async function load() {
  return import('../adblock');
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const CACHE_PATH = join('C:/user', 'adblock-cache.txt');

function fakeRequest(): any {
  const req = new EventEmitter() as any;
  req.destroy = vi.fn();
  return req;
}

function serve(spec: ResponseSpec) {
  state.httpsGet.mockImplementationOnce(
    (url: string, _options: unknown, cb: (res: any) => void) => {
      state.requestUrls.push(url);
      const req = fakeRequest();
      const res = new EventEmitter() as any;
      res.statusCode = spec.statusCode ?? 200;
      res.headers = spec.headers ?? {};
      res.resume = vi.fn();
      queueMicrotask(() => {
        if (spec.reqError) {
          req.emit('error', new Error('socket'));
          return;
        }
        if (spec.timeout) {
          req.emit('timeout');
          return;
        }
        if (spec.resError) {
          res.emit('error', new Error('stream'));
          return;
        }
        if (spec.body !== undefined) res.emit('data', Buffer.from(spec.body));
        res.emit('end');
      });
      cb(res);
      return req;
    }
  );
}

function serveFilterBodies(first: string, second: string) {
  serve({ body: first });
  serve({ body: second });
}

function contents() {
  return {
    on: state.contentsOn,
    getType: state.getType,
    getURL: state.getURL,
    insertCSS: state.insertCSS,
    executeJavaScript: state.executeJS
  };
}

function installHandler() {
  state.appOn.mock.calls.forEach(([event, handler]) => {
    if (event === 'web-contents-created') handler({}, contents());
  });
}

beforeEach(() => {
  vi.resetModules();
  state.beforeRequest = null;
  state.responses = [];
  state.requestUrls = [];
  state.filterSet = { network: [], cosmetic: [], scriptlets: [] };
  state.matchesFilters = false;
  state.scriptlets = [];
  state.getPath.mockReturnValue('C:/user');
  state.appOn.mockReset();
  state.fromPartition.mockReset();
  state.fromPartition.mockReturnValue({
    webRequest: {
      onBeforeRequest: (_filter: unknown, cb: any) => {
        state.beforeRequest = cb;
      }
    }
  });
  state.contentsOn.mockReset();
  state.getType.mockReset();
  state.getType.mockReturnValue('webview');
  state.getURL.mockReset();
  state.getURL.mockReturnValue('https://page.example/watch');
  state.insertCSS.mockReset();
  state.insertCSS.mockResolvedValue(undefined);
  state.executeJS.mockReset();
  state.executeJS.mockResolvedValue(undefined);
  state.loggerInfo.mockReset();
  state.loggerWarn.mockReset();
  state.stat.mockReset();
  state.stat.mockResolvedValue(null);
  state.readFile.mockReset();
  state.readFile.mockResolvedValue('');
  state.writeFile.mockReset();
  state.writeFile.mockResolvedValue(undefined);
  state.httpsGet.mockReset();
  state.parseFilterList.mockReset();
  state.parseFilterList.mockImplementation(() => state.filterSet);
  state.matchNetwork.mockReset();
  state.matchNetwork.mockReturnValue(false);
  state.cosmeticCssFor.mockReset();
  state.cosmeticCssFor.mockReturnValue('.cosmetic{display:none}');
  state.scriptletsFor.mockReset();
  state.scriptletsFor.mockImplementation(() => state.scriptlets);
  state.hostOf.mockReset();
  state.hostOf.mockReturnValue('page.example');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('installation', () => {
  it('installs the request filter and lifecycle listener once', async () => {
    serveFilterBodies('', '');
    const { installPreviewAdblock } = await load();

    installPreviewAdblock();
    installPreviewAdblock();
    await flush();

    expect(state.fromPartition).toHaveBeenCalledTimes(1);
    expect(state.appOn).toHaveBeenCalledTimes(1);
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'preview',
      'adblock installed (preview session only)'
    );
  });

  it('cancels blocked requests and allows the rest', async () => {
    state.filterSet = { network: [{ rule: 1 }], cosmetic: [], scriptlets: [] };
    state.stat.mockResolvedValue({ mtimeMs: Date.now() });
    state.readFile.mockResolvedValue('');
    const { installPreviewAdblock, setPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    const decide = (url: string, initiator = 'https://page.example') => {
      let result: { cancel?: boolean } = {};
      state.beforeRequest({ url, resourceType: 'xhr', initiator }, (r: any) => {
        result = r;
      });
      return result;
    };

    expect(decide('https://doubleclick.net/x').cancel).toBe(true);
    expect(decide('https://cdn.example.com/clip.mp4').cancel).toBeUndefined();

    state.matchNetwork.mockReturnValue(true);
    expect(decide('https://tracker.example/x').cancel).toBe(true);
    expect(state.matchNetwork).toHaveBeenCalledWith(
      state.filterSet,
      expect.objectContaining({ url: 'https://tracker.example/x', initiatorHost: 'page.example' })
    );

    setPreviewAdblock(false);
    expect(decide('https://doubleclick.net/x').cancel).toBeUndefined();
    setPreviewAdblock(true);
  });

  it('skips the filter engine when no network rules are loaded', async () => {
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    let result: any = {};
    state.beforeRequest({ url: 'https://plain.example/x', resourceType: 'xhr' }, (r: any) => {
      result = r;
    });

    expect(result.cancel).toBeUndefined();
    expect(state.matchNetwork).not.toHaveBeenCalled();
  });

  it('injects cosmetic rules into webviews only', async () => {
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    installHandler();
    await flush();

    const didFinish = state.contentsOn.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )![1];
    didFinish();
    await flush();

    expect(state.hostOf).toHaveBeenCalledWith('https://page.example/watch');
    expect(state.insertCSS).toHaveBeenCalledWith(expect.stringContaining('.cosmetic'));
    expect(state.executeJS).toHaveBeenCalledWith(expect.stringContaining('window.open'), true);

    state.getType.mockReturnValue('window');
    state.insertCSS.mockClear();
    didFinish();
    await flush();
    expect(state.insertCSS).not.toHaveBeenCalled();
  });

  it('does not inject while disabled', async () => {
    const { installPreviewAdblock, setPreviewAdblock } = await load();
    installPreviewAdblock();
    setPreviewAdblock(false);
    installHandler();
    await flush();

    const didFinish = state.contentsOn.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )![1];
    didFinish();
    await flush();

    expect(state.insertCSS).not.toHaveBeenCalled();
    expect(state.executeJS).not.toHaveBeenCalled();
    setPreviewAdblock(true);
  });

  it('builds scriptlet code for nowoif and set-constant', async () => {
    state.scriptlets = [
      { name: 'nowoif', args: [] },
      { name: 'set-constant', args: ['foo.bar', '42'] },
      { name: 'set-constant', args: ['noValue'] },
      { name: 'other', args: [] }
    ];
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    installHandler();
    await flush();

    const didFinish = state.contentsOn.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )![1];
    didFinish();
    await flush();

    const script = state.executeJS.mock.calls[0][0] as string;
    expect(script).toContain('window.open=()=>null');
    expect(script).toContain('Object.defineProperty(window,"foo.bar"');
    expect(script).toContain('get:()=>(42)');
    expect(script).toContain('Object.defineProperty(window,"noValue"');
    expect(script).toContain('get:()=>(undefined)');
  });

  it('tolerates injection failures', async () => {
    state.insertCSS.mockRejectedValue(new Error('csp'));
    state.executeJS.mockRejectedValue(new Error('csp'));
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    installHandler();
    await flush();

    const didFinish = state.contentsOn.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )![1];
    expect(() => didFinish()).not.toThrow();
    await flush();
    expect(state.insertCSS).toHaveBeenCalled();
  });
});

describe('filter loading', () => {
  it('uses a fresh disk cache', async () => {
    state.stat.mockResolvedValue({ mtimeMs: Date.now() });
    state.readFile.mockResolvedValue('||ads.example.com^\n');
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.readFile).toHaveBeenCalledWith(CACHE_PATH, 'utf-8');
    expect(state.parseFilterList).toHaveBeenCalledWith('||ads.example.com^\n');
    expect(state.httpsGet).not.toHaveBeenCalled();
    expect(state.writeFile).not.toHaveBeenCalled();
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'preview',
      expect.stringContaining('adblock filters from cache')
    );
  });

  it('fetches and caches a stale entry', async () => {
    state.stat.mockResolvedValue({ mtimeMs: 0 });
    serveFilterBodies('first', 'second');
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.requestUrls).toHaveLength(2);
    expect(state.parseFilterList).toHaveBeenCalledWith('first\nsecond');
    expect(state.writeFile).toHaveBeenCalledWith(CACHE_PATH, 'first\nsecond', 'utf-8');
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'preview',
      expect.stringContaining('adblock filters fetched')
    );
  });

  it('fetches when the cache cannot be read', async () => {
    state.stat.mockResolvedValue({ mtimeMs: Date.now() });
    state.readFile.mockRejectedValue(new Error('denied'));
    serveFilterBodies('body', '');
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'preview',
      'adblock cache read failed',
      expect.any(Error)
    );
    expect(state.parseFilterList).toHaveBeenCalledWith('body');
  });

  it('fetches when stat fails', async () => {
    state.stat.mockRejectedValue(new Error('ENOENT'));
    serveFilterBodies('body', '');
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).toHaveBeenCalledWith('body');
  });

  it('keeps built-in rules when both downloads are empty', async () => {
    serveFilterBodies('', '');
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).not.toHaveBeenCalled();
    expect(state.writeFile).not.toHaveBeenCalled();
  });

  it('logs fetch failures and keeps the built-in rules', async () => {
    state.httpsGet.mockImplementation(() => {
      throw new Error('offline');
    });
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'preview',
      'adblock filters fetch failed (built-in rules only)',
      expect.any(Error)
    );
    expect(state.parseFilterList).not.toHaveBeenCalled();
  });

  it('does not reload filters on later installs', async () => {
    state.stat.mockResolvedValue(null);
    serveFilterBodies('body', '');
    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();
    installPreviewAdblock();
    await flush();

    expect(state.httpsGet).toHaveBeenCalledTimes(2);
  });
});

describe('fetchText branches', () => {
  it('follows redirects', async () => {
    state.stat.mockResolvedValue(null);
    serve({ statusCode: 302, headers: { location: '/moved.txt' } });
    serve({ statusCode: 302, headers: { location: 'https://cdn.example/final.txt' } });
    serve({ body: 'final body' });
    serve({ body: '' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.requestUrls).toEqual([
      'https://raw.githubusercontent.com/MajkiIT/polish-ads-filter/master/polish-adblock-filters/adblock_ublock.txt',
      'https://raw.githubusercontent.com/moved.txt',
      'https://cdn.example/final.txt',
      'https://raw.githubusercontent.com/MajkiIT/polish-ads-filter/master/polish-adblock-filters/adblock.txt'
    ]);
    expect(state.parseFilterList).toHaveBeenCalledWith('final body');
  });

  it('ignores a redirect without a location', async () => {
    state.stat.mockResolvedValue(null);
    serve({ statusCode: 302 });
    serve({ body: 'second' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).toHaveBeenCalledWith('second');
  });

  it('ignores non-200 responses', async () => {
    state.stat.mockResolvedValue(null);
    serve({ statusCode: 404, body: 'not found' });
    serve({ body: 'second' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).toHaveBeenCalledWith('second');
  });

  it('ignores response stream errors', async () => {
    state.stat.mockResolvedValue(null);
    serve({ resError: true });
    serve({ body: 'second' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).toHaveBeenCalledWith('second');
  });

  it('ignores request errors', async () => {
    state.stat.mockResolvedValue(null);
    serve({ reqError: true });
    serve({ body: 'second' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).toHaveBeenCalledWith('second');
  });

  it('gives up on timeouts', async () => {
    state.stat.mockResolvedValue(null);
    serve({ timeout: true });
    serve({ body: 'second' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    expect(state.parseFilterList).toHaveBeenCalledWith('second');
  });

  it('drops oversized payloads', async () => {
    state.stat.mockResolvedValue(null);
    serve({ body: 'x'.repeat(9 * 1024 * 1024) });
    serve({ body: 'second' });

    const { installPreviewAdblock } = await load();
    installPreviewAdblock();
    await flush();

    // The oversized chunk is skipped entirely, leaving only the second body.
    expect(state.parseFilterList).toHaveBeenCalledWith('second');
  });
});
