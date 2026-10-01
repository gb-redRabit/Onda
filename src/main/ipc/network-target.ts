import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const NON_PUBLIC_V4 = new BlockList();
const NON_PUBLIC_V6 = new BlockList();

// Adresy, które nigdy nie są legalnym publicznym origin. Pozostają zablokowane nawet
// gdy wywołujący włączy RFC1918 (domowa stacja radiowa w LAN): loopback sięga
// do tego, co użytkownik uruchamia lokalnie, a link-local obejmuje 169.254.169.254,
// endpoint metadanych chmury.
const NEVER_PUBLIC_V4 = new BlockList();
const NEVER_PUBLIC_V6 = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  NON_PUBLIC_V4.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  NEVER_PUBLIC_V4.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  NON_PUBLIC_V6.addSubnet(network, prefix, 'ipv6');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  NEVER_PUBLIC_V6.addSubnet(network, prefix, 'ipv6');
}

export interface ResolvedNetworkTarget {
  url: URL;
  addresses: LookupAddress[];
}

type LookupAllAddresses = (hostname: string) => Promise<LookupAddress[]>;

export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return NON_PUBLIC_V4.check(address, 'ipv4');
  if (family === 6) return NON_PUBLIC_V6.check(address, 'ipv6');
  return true;
}

/**
 * True dla dosłownego adresu loopback, link-local, nieokreślonego lub w inny sposób
 * nieroutowalnego — zakresów, które nigdy nie są legalnym publicznym origin, nawet
 * dla wywołującego, który zezwala na sieć prywatną.
 *
 * Ma sens tylko dla dosłownego adresu: nazwa hosta nie jest adresem IP, więc
 * zwraca true dla wszystkiego, czego nie potrafi zaklasyfikować. Wywołujący, którzy mają
 * nazwę hosta, muszą najpierw zabezpieczyć się `isIP()` (albo użyć `resolveNetworkTarget`, który najpierw
 * rozwiązuje, a potem sprawdza odpowiedzi).
 */
export function isNeverPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return NEVER_PUBLIC_V4.check(address, 'ipv4');
  if (family === 6) return NEVER_PUBLIC_V6.check(address, 'ipv6');
  return true;
}

/**
 * True dla hosta loopback w każdym typowym zapisie: `localhost`, nazwa `*.localhost`,
 * `::1` lub dowolny dosłowny adres z `127.0.0.0/8`. Współdzielone przez walidatory URL, które
 * odrzucają URL-e pochodzące z sieci wskazujące na lokalne usługi.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

export interface NetworkTargetOptions {
  /**
   * Zezwala na niepubliczną przestrzeń adresową dla celu wyraźnie zatwierdzonego
   * przez użytkownika (źródło mediów z przełącznikiem sieci prywatnej, stacja
   * radiowa w LAN). Loopback jest uwzględniony, bo lokalna usługa na 127.0.0.1 jest
   * legalnym źródłem.
   */
  allowPrivateNetwork?: boolean;
  /**
   * Zawęża `allowPrivateNetwork`, dodatkowo blokując loopback,
   * link-local i adres nieokreślony. 169.254.169.254 to endpoint metadanych
   * chmury, a loopback to cokolwiek działa na tej maszynie; ścieżka
   * osiągalna z renderera nie powinna domyślnie sięgać do żadnego z nich.
   */
  blockLoopback?: boolean;
}

/** Rozwiązuje URL raz, domyślnie odrzuca cele prywatne i zwraca przypięte adresy IP. */
export async function resolveNetworkTarget(
  rawUrl: string,
  options: NetworkTargetOptions = {},
  lookupHost: LookupAllAddresses = (hostname) => dnsLookup(hostname, { all: true, verbatim: true })
): Promise<ResolvedNetworkTarget> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported network protocol');
  }
  if (url.username || url.password) throw new Error('Credentials in URL are not allowed');

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  const addresses: LookupAddress[] = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupHost(hostname);
  if (addresses.length === 0) throw new Error('Host did not resolve');
  if (!options.allowPrivateNetwork) {
    if (addresses.some(({ address }) => isNonPublicAddress(address))) {
      throw new Error('Private network address is not allowed');
    }
  } else if (
    options.blockLoopback &&
    addresses.some(({ address }) => isNeverPublicAddress(address))
  ) {
    throw new Error('Loopback address is not allowed');
  }

  return { url, addresses };
}

/** Prywatny cel jest zaufany tylko dla oryginalnego, zatwierdzonego przez użytkownika origin. */
export function privateNetworkAllowedForTarget(
  targetUrl: string,
  trustedOrigin: string,
  userApproved: boolean
): boolean {
  return userApproved && new URL(targetUrl).origin === new URL(trustedOrigin).origin;
}

/** Callback lookup, który przypina połączenie do właśnie zwalidowanych adresów. */
export function createPinnedLookup(addresses: LookupAddress[]) {
  return (
    _hostname: string,
    options: LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void
  ): void => {
    const matching = options.family
      ? addresses.filter((address) => address.family === options.family)
      : addresses;
    if (matching.length === 0) {
      const error = new Error(
        'No validated address for requested IP family'
      ) as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '');
      return;
    }
    if (options.all) callback(null, matching);
    else callback(null, matching[0].address, matching[0].family);
  };
}
