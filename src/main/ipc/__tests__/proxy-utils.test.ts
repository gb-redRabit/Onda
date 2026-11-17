import { describe, expect, it, vi, beforeEach } from 'vitest';

interface ProxyConfig {
  enabled?: boolean;
  type?: 'http' | 'https' | 'socks5';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

let network: Record<string, unknown> | undefined;
let storeFails = false;

vi.mock('../cover/cover-cache', () => ({
  getStore: async () => {
    if (storeFails) throw new Error('store down');
    return {
      get: (key: string) => (key === 'network' ? network : undefined)
    };
  }
}));

const { readProxyArgs, readUserAgentArgs, readNetworkArgs, readSpeedLimitArgs } =
  await import('../proxy-utils');

const proxy = (over: ProxyConfig = {}): ProxyConfig => ({
  enabled: true,
  type: 'http',
  host: '10.0.0.1',
  port: 8080,
  ...over
});

beforeEach(() => {
  network = undefined;
  storeFails = false;
});

describe('proxy-utils', () => {
  it('uses the global proxy for every scope by default', async () => {
    network = { proxy: proxy() };

    expect(await readProxyArgs('youtube')).toEqual(['--proxy', 'http://10.0.0.1:8080']);
    expect(await readProxyArgs('soundcloud')).toEqual(['--proxy', 'http://10.0.0.1:8080']);
  });

  it('prefers the per-platform proxy when proxyPerPlatform is on', async () => {
    network = {
      proxy: proxy({ host: '10.0.0.1' }),
      proxyPerPlatform: true,
      proxyYoutube: proxy({ host: '10.0.0.2', port: 3128 }),
      proxySoundcloud: proxy({ enabled: false })
    };

    expect(await readProxyArgs('youtube')).toEqual(['--proxy', 'http://10.0.0.2:3128']);
    // Własne proxy SoundCloud jest wyłączone -> następuje powrót do globalnego.
    expect(await readProxyArgs('soundcloud')).toEqual(['--proxy', 'http://10.0.0.1:8080']);
  });

  it('builds socks5 URLs with credentials', async () => {
    network = {
      proxyPerPlatform: true,
      proxyYoutube: proxy({
        type: 'socks5',
        host: 'proxy.local',
        port: 1080,
        username: 'u',
        password: 'p'
      })
    };

    expect(await readProxyArgs('youtube')).toEqual(['--proxy', 'socks5://u:p@proxy.local:1080']);
  });

  it('returns no proxy args when nothing is enabled', async () => {
    network = { proxy: proxy({ enabled: false }) };

    expect(await readProxyArgs('youtube')).toEqual([]);
    expect(await readProxyArgs()).toEqual([]);
  });

  it('passes a custom user agent to yt-dlp only when set', async () => {
    network = { proxy: proxy(), userAgent: '  OndaTest/1.0  ' };
    expect(await readUserAgentArgs()).toEqual(['--user-agent', 'OndaTest/1.0']);

    network = { proxy: proxy(), userAgent: '   ' };
    expect(await readUserAgentArgs()).toEqual([]);
  });

  it('combines proxy and user agent for the same yt-dlp call', async () => {
    network = { proxy: proxy(), userAgent: 'OndaTest/1.0' };

    expect(await readNetworkArgs('youtube')).toEqual([
      '--proxy',
      'http://10.0.0.1:8080',
      '--user-agent',
      'OndaTest/1.0'
    ]);
  });

  it('maps the download speed limit to --limit-rate', async () => {
    network = { downloadSpeedLimit: 512 };
    expect(await readSpeedLimitArgs()).toEqual(['--limit-rate', '512K']);

    network = { downloadSpeedLimit: 0 };
    expect(await readSpeedLimitArgs()).toEqual([]);
  });
});

describe('proxy-utils edge credentials and scopes', () => {
  it('omits the password and port when unset', async () => {
    network = { proxy: proxy({ username: 'user', port: 0 }) };

    expect(await readProxyArgs('youtube')).toEqual(['--proxy', 'http://user@10.0.0.1']);
  });

  it('uses an enabled soundcloud proxy and ignores per-platform for generic', async () => {
    network = {
      proxy: proxy({ host: 'global' }),
      proxyPerPlatform: true,
      proxyYoutube: proxy({ host: 'yt' }),
      proxySoundcloud: proxy({ host: 'sc', port: 999 })
    };

    expect(await readProxyArgs('soundcloud')).toEqual(['--proxy', 'http://sc:999']);
    expect(await readProxyArgs()).toEqual(['--proxy', 'http://global:8080']);
  });

  it('falls back when the settings store cannot be read', async () => {
    storeFails = true;

    expect(await readProxyArgs()).toEqual([]);
    expect(await readUserAgentArgs()).toEqual([]);
    expect(await readSpeedLimitArgs()).toEqual([]);
  });
});
