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

/** Do której platformy należy żądanie — wybiera proxy dla danej platformy. */
export type ProxyScope = 'youtube' | 'soundcloud' | 'generic';

// Buduje argumenty `--proxy` yt-dlp z zapisanych ustawień sieci.
function proxyToArgs(proxy: ProxyConfig | undefined | null): string[] {
  if (!proxy || !proxy.enabled || !proxy.host) return [];
  const scheme = proxy.type === 'socks5' ? 'socks5' : 'http';
  const auth = proxy.username
    ? `${proxy.username}${proxy.password ? `:${proxy.password}` : ''}@`
    : '';
  const port = proxy.port && proxy.port > 0 ? `:${proxy.port}` : '';
  return ['--proxy', `${scheme}://${auth}${proxy.host}${port}`];
}

// Proxy dla danej platformy stosuje się tylko wtedy, gdy użytkownik włączył ten tryb ORAZ
// samo proxy dla platformy; w przeciwnym razie używane jest proxy globalne.
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

// Niestandardowy User-Agent dla yt-dlp (niektóre regiony/ISP wymagają konkretnego). Serwer
// mediów celowo trzyma własny stały UA: adresy odtwarzania googlevideo są podpisane
// dla klienta, który je rozwiązał.
export async function readUserAgentArgs(): Promise<string[]> {
  const userAgent = (await readNetworkSettings())?.userAgent?.trim();
  return userAgent ? ['--user-agent', userAgent] : [];
}

// Proxy + User-Agent razem — zawsze jadą z tym samym wywołaniem yt-dlp.
export async function readNetworkArgs(scope: ProxyScope): Promise<string[]> {
  return [...(await readProxyArgs(scope)), ...(await readUserAgentArgs())];
}

// Buduje argumenty `--limit-rate` yt-dlp z zapisanego limitu prędkości pobierania
// (KB/s, 0 = bez limitu).
export async function readSpeedLimitArgs(): Promise<string[]> {
  const kb = (await readNetworkSettings())?.downloadSpeedLimit;
  if (typeof kb === 'number' && kb > 0) return ['--limit-rate', `${Math.floor(kb)}K`];
  return [];
}
