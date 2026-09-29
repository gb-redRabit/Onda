import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const NON_PUBLIC_V4 = new BlockList();
const NON_PUBLIC_V6 = new BlockList();

// Addresses that are never a legitimate public origin. These stay blocked even
// when a caller opts into RFC1918 (a home LAN radio station): loopback reaches
// whatever the user runs locally, and link-local covers 169.254.169.254, the
// cloud metadata endpoint.
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
 * True for a loopback, link-local, unspecified or otherwise non-routable
 * LITERAL address — the ranges that are never a legitimate public origin, even
 * for a caller that allows a private network.
 *
 * Only meaningful for an address literal: a hostname is not an IP, so this
 * returns true for anything it cannot classify. Callers that hold a hostname
 * must guard with `isIP()` first (or use `resolveNetworkTarget`, which resolves
 * first and then checks the answers).
 */
export function isNeverPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return NEVER_PUBLIC_V4.check(address, 'ipv4');
  if (family === 6) return NEVER_PUBLIC_V6.check(address, 'ipv6');
  return true;
}

export interface NetworkTargetOptions {
  /**
   * Allows the non-public address space, for a target the user explicitly
   * approved (a media source with the private-network toggle, a LAN radio
   * station). Loopback is included, because a local service on 127.0.0.1 is a
   * legitimate source.
   */
  allowPrivateNetwork?: boolean;
  /**
   * Narrows `allowPrivateNetwork` by additionally blocking loopback,
   * link-local and the unspecified address. 169.254.169.254 is the cloud
   * metadata endpoint and loopback is whatever runs on this machine; a path
   * reachable from the renderer should not reach either by default.
   */
  blockLoopback?: boolean;
}

/** Resolves a URL once, rejects private targets by default and returns pinned IPs. */
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
