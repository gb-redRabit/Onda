import { getStore } from './cover/cover-cache';

interface ProxyConfig {
  enabled?: boolean;
  type?: 'http' | 'https' | 'socks5';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

interface NetworkSettingsLike {
  proxy?: ProxyConfig;
  proxyPerPlatform?: boolean;
  proxyYoutube?: ProxyConfig;
  proxySoundcloud?: ProxyConfig;
  userAgent?: string;
  downloadSpeedLimit?: number;
}

/** Which platform a request belongs to — picks the per-platform proxy. */
export type ProxyScope = 'youtube' | 'soundcloud' | 'generic';

// Builds yt-dlp `--proxy` args from the persisted network settings.
function proxyToArgs(proxy: ProxyConfig | undefined | null): string[] {
  if (!proxy || !proxy.enabled || !proxy.host) return [];
  const scheme = proxy.type === 'socks5' ? 'socks5' : 'http';
  const auth = proxy.username
    ? `${proxy.username}${proxy.password ? `:${proxy.password}` : ''}@`
    : '';
  const port = proxy.port && proxy.port > 0 ? `:${proxy.port}` : '';
  return ['--proxy', `${scheme}://${auth}${proxy.host}${port}`];
}

// Per-platform proxies apply only when the user enabled that mode AND the
// per-platform proxy itself; otherwise the global proxy is used.
function pickProxy(
  network: NetworkSettingsLike | undefined,
  scope: ProxyScope
): ProxyConfig | undefined {
  if (!network) return undefined;
  if (network.proxyPerPlatform) {
    const perPlatform =
      scope === 'youtube'
        ? network.proxyYoutube
        : scope === 'soundcloud'
          ? network.proxySoundcloud
          : undefined;
    if (perPlatform?.enabled && perPlatform.host) return perPlatform;
  }
  return network.proxy;
}

async function readNetworkSettings(): Promise<NetworkSettingsLike | undefined> {
  try {
    const store = await getStore();
    return store.get('network') as NetworkSettingsLike | undefined;
  } catch {
    return undefined;
  }
}

export async function readProxyArgs(scope: ProxyScope = 'generic'): Promise<string[]> {
  return proxyToArgs(pickProxy(await readNetworkSettings(), scope));
}

// Custom User-Agent for yt-dlp (some regions/ISPs need a specific one). The media
// server keeps its own fixed UA on purpose: googlevideo playback URLs are signed
// for the client that resolved them.
export async function readUserAgentArgs(): Promise<string[]> {
  const userAgent = (await readNetworkSettings())?.userAgent?.trim();
  return userAgent ? ['--user-agent', userAgent] : [];
}

// Proxy + User-Agent together — they always travel with the same yt-dlp call.
export async function readNetworkArgs(scope: ProxyScope): Promise<string[]> {
  return [...(await readProxyArgs(scope)), ...(await readUserAgentArgs())];
}

// Builds yt-dlp `--limit-rate` args from the persisted download speed limit
// (KB/s, 0 = unlimited).
export async function readSpeedLimitArgs(): Promise<string[]> {
  const kb = (await readNetworkSettings())?.downloadSpeedLimit;
  if (typeof kb === 'number' && kb > 0) return ['--limit-rate', `${Math.floor(kb)}K`];
  return [];
}
