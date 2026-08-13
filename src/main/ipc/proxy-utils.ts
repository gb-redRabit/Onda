import { getStore } from './cover-cache';

export interface ProxyConfig {
  enabled?: boolean;
  type?: 'http' | 'https' | 'socks5';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

// Builds yt-dlp `--proxy` args from the persisted network settings.
export function proxyToArgs(proxy: ProxyConfig | undefined | null): string[] {
  if (!proxy || !proxy.enabled || !proxy.host) return [];
  const scheme = proxy.type === 'socks5' ? 'socks5' : 'http';
  const auth = proxy.username
    ? `${proxy.username}${proxy.password ? `:${proxy.password}` : ''}@`
    : '';
  const port = proxy.port && proxy.port > 0 ? `:${proxy.port}` : '';
  return ['--proxy', `${scheme}://${auth}${proxy.host}${port}`];
}

export async function readProxyArgs(): Promise<string[]> {
  try {
    const store = await getStore();
    const network = store.get('network') as { proxy?: ProxyConfig } | undefined;
    return proxyToArgs(network?.proxy);
  } catch {
    return [];
  }
}

// Builds yt-dlp `--limit-rate` args from the persisted download speed limit
// (KB/s, 0 = unlimited).
export async function readSpeedLimitArgs(): Promise<string[]> {
  try {
    const store = await getStore();
    const network = store.get('network') as { downloadSpeedLimit?: number } | undefined;
    const kb = network?.downloadSpeedLimit;
    if (typeof kb === 'number' && kb > 0) return ['--limit-rate', `${Math.floor(kb)}K`];
    return [];
  } catch {
    return [];
  }
}
