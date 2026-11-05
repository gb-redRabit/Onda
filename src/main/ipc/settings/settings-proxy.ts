import type { NetworkSettings } from '../../../shared/types/settings';
import { logger } from '../../../shared/logger';
import { encryptSecret, SecretStorageUnavailableError } from './settings-crypto';

// Polityka haseł proxy: renderer widzi tylko maskę, zapis zachowuje poprzednie
// hasło, a na dysk trafia ono przez `safeStorage` (jak klucze API).

export const PROXY_PASSWORD_MASK = '••••••••';
type ProxyKey = 'proxy' | 'proxyYoutube' | 'proxySoundcloud';
const PROXY_KEYS: ProxyKey[] = ['proxy', 'proxyYoutube', 'proxySoundcloud'];

export function maskProxyPasswords(network: NetworkSettings | undefined): void {
  if (!network) return;
  for (const key of PROXY_KEYS) {
    const proxy = network[key];
    if (proxy && typeof proxy.password === 'string' && proxy.password) {
      proxy.password = PROXY_PASSWORD_MASK;
    }
  }
}

export function restoreProxyPasswords(
  incoming: NetworkSettings | undefined,
  stored: NetworkSettings | undefined
): void {
  if (!incoming) return;
  for (const key of PROXY_KEYS) {
    const proxy = incoming[key];
    if (!proxy) continue;
    // Maska lub brak pola = „nie zmieniaj"; pusty string = użytkownik czyści hasło.
    if (proxy.password === PROXY_PASSWORD_MASK || proxy.password === undefined) {
      proxy.password = stored?.[key]?.password;
    }
  }
}

export function stripProxyPasswords(network: NetworkSettings | undefined): void {
  if (!network) return;
  for (const key of PROXY_KEYS) {
    if (network[key]) network[key].password = undefined;
  }
}

/**
 * Szyfruje hasła proxy przed zapisem. Gdy keyring jest niedostępny, zostaje
 * dotychczasowe zachowanie (electron-store) zamiast blokowania całego zapisu.
 */
export function encryptProxyPasswords(network: NetworkSettings | undefined): void {
  if (!network) return;
  for (const key of PROXY_KEYS) {
    const proxy = network[key];
    if (!proxy || typeof proxy.password !== 'string' || !proxy.password) continue;
    if (proxy.password === PROXY_PASSWORD_MASK) continue;
    try {
      proxy.password = encryptSecret(proxy.password);
    } catch (e) {
      if (!(e instanceof SecretStorageUnavailableError)) throw e;
      logger.warn('settings', 'proxy password kept in store: secure storage unavailable');
    }
  }
}
