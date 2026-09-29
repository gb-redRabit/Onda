import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const NON_PUBLIC_V4 = new BlockList();
const NON_PUBLIC_V6 = new BlockList();

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

/** Resolves a URL once, rejects private targets by default and returns pinned IPs. */
export async function resolveNetworkTarget(
  rawUrl: string,
  options: { allowPrivateNetwork?: boolean } = {},
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
  if (
    !options.allowPrivateNetwork &&
    addresses.some(({ address }) => isNonPublicAddress(address))
  ) {
    throw new Error('Private network address is not allowed');
  }

  return { url, addresses };
}

/** A private target is trusted only for the original, user-approved origin. */
export function privateNetworkAllowedForTarget(
  targetUrl: string,
  trustedOrigin: string,
  userApproved: boolean
): boolean {
  return userApproved && new URL(targetUrl).origin === new URL(trustedOrigin).origin;
}

/** A lookup callback that pins the connection to the addresses just validated. */
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
