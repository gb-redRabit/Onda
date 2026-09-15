// Pure plugin-storage / network guard helpers extracted from `plugins-core.ts`
// (plan 2.8). `plugins-core` re-exports them so importers and tests stay
// unchanged.
import type { PluginPermissions } from '../../shared/types/ipc';

export const STORAGE_KEY_RE = /^[a-zA-Z0-9_.\-]{1,64}$/;
export const MAX_STRING_VALUE_BYTES = 4096;

// Permission checks (plan 7.1): the manifest decides which bridge operations a
// plugin may use. Fetch checks the network allowlist in the handler; storage and
// settings go through these helpers.
export function storagePermissionGranted(permissions: PluginPermissions): boolean {
  return permissions.storage === true;
}

// A plugin without the storage permission may only write settings it explicitly
// declared in the manifest — otherwise settings would be an unbounded side door
// around the storage quota and the storage permission itself.
export function settingWriteAllowed(
  permissions: PluginPermissions,
  declaredKeys: readonly string[] | undefined,
  key: string
): boolean {
  if (permissions.storage === true) return true;
  return (declaredKeys ?? []).includes(key);
}

export function validStorageKey(key: unknown): key is string {
  return typeof key === 'string' && STORAGE_KEY_RE.test(key);
}

export function storageSizeBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function sanitizeStoredObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!validStorageKey(key)) continue;
    if (storageSizeBytes(value) > MAX_STRING_VALUE_BYTES) continue;
    out[key] = value;
  }
  return out;
}

export function compileNetworkPattern(pattern: string): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 500) return null;
  let protocol: string;
  try {
    protocol = new URL(pattern).protocol;
  } catch {
    return null;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  const parts = pattern.split('*');
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  try {
    return new RegExp(`^${escaped}`);
  } catch {
    return null;
  }
}

export function urlAllowed(url: string, patterns: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return patterns.some((p) => {
    const re = compileNetworkPattern(p);
    return re ? re.test(url) : false;
  });
}

export function resolveRedirectUrl(baseUrl: string, location: string): string | null {
  try {
    const u = new URL(location, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}
