import type { LookupAddress } from 'node:dns';
import { resolveNetworkTarget } from '../ipc/network-target';

const GENERIC_STREAM_TTL_MS = 5 * 60 * 60 * 1000;
const MAX_REGISTERED_GENERIC_STREAMS = 256;
const genericStreamUrls = new Map<string, number>();

type LookupAllAddresses = (hostname: string) => Promise<LookupAddress[]>;

/**
 * Rejestruje tylko URL-e zwrócone przez generyczny extractor yt-dlp. Proxy
 * strumienia i tak rozwiązuje i przypina adres przed każdym żądaniem, więc ten
 * rejestr nie zamienia serwera mediów w proxy dowolnych URL-i.
 */
export async function registerGenericStreamUrl(
  rawUrl: string,
  lookupHost?: LookupAllAddresses,
  now = Date.now()
): Promise<void> {
  if (rawUrl.length > 8192) throw new Error('Stream URL is too long');
  const target = await resolveNetworkTarget(rawUrl, {}, lookupHost);
  const key = target.url.href;

  // Odświeża kolejność wstawiania oraz wygaśnięcie, czyniąc ograniczoną mapę podobną do LRU.
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
