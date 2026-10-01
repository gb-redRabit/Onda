import type { LookupAddress } from 'node:dns';
import { resolveNetworkTarget } from '../ipc/network-target';

const GENERIC_STREAM_TTL_MS = 5 * 60 * 60 * 1000;
const MAX_REGISTERED_GENERIC_STREAMS = 256;
const genericStreamUrls = new Map<string, number>();

type LookupAllAddresses = (hostname: string) => Promise<LookupAddress[]>;

/**
 * Register only URLs returned by yt-dlp's generic extractor. The stream proxy
 * still resolves and pins the address before every request, so this registry
 * does not turn the media server into an arbitrary URL proxy.
 */
export async function registerGenericStreamUrl(
  rawUrl: string,
  lookupHost?: LookupAllAddresses,
  now = Date.now()
): Promise<void> {
  if (rawUrl.length > 8192) throw new Error('Stream URL is too long');
  const target = await resolveNetworkTarget(rawUrl, {}, lookupHost);
  const key = target.url.href;

  // Refresh insertion order as well as expiry, making the bounded map LRU-like.
  genericStreamUrls.delete(key);
  genericStreamUrls.set(key, now + GENERIC_STREAM_TTL_MS);
  for (const [registeredUrl, expiresAt] of genericStreamUrls) {
    if (expiresAt <= now) genericStreamUrls.delete(registeredUrl);
  }
  while (genericStreamUrls.size > MAX_REGISTERED_GENERIC_STREAMS) {
    const oldest = genericStreamUrls.keys().next().value as string | undefined;
    if (!oldest) break;
    genericStreamUrls.delete(oldest);
  }
}

export function isRegisteredGenericStreamUrl(rawUrl: string, now = Date.now()): boolean {
  let key: string;
  try {
    key = new URL(rawUrl).href;
  } catch {
    return false;
  }
  const expiresAt = genericStreamUrls.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt <= now) {
    genericStreamUrls.delete(key);
    return false;
  }
  return true;
}
