import { resolve, sep, normalize } from 'path';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import type {
  PluginLayoutElement,
  PluginManifest,
  PluginPermissions,
  PluginSettingField
} from '../../shared/types/ipc';

export const PLUGIN_ID_RE = /^[a-z0-9\-_.]+$/i;
export const PLUGIN_ENTRY_RE = /^[a-zA-Z0-9_\-./ ]{1,200}\.js$/;
export const STORAGE_KEY_RE = /^[a-zA-Z0-9_.\-]{1,64}$/;

export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_ENTRY_BYTES = 1024 * 1024;
export const MAX_PLUGINS = 20;
export const MAX_STORAGE_BYTES = 256 * 1024;
export const MAX_STORAGE_KEYS = 100;
export const MAX_STRING_VALUE_BYTES = 4096;
export const MAX_FETCH_BYTES = 10 * 1024 * 1024;
export const MAX_FETCH_TEXT_BYTES = 1024 * 1024;
export const MAX_FETCH_REDIRECTS = 5;
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const MAX_FETCH_TIMEOUT_MS = 30_000;

export interface ParsedManifest {
  manifest: PluginManifest;
  error?: string;
}

export function validatePluginId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 80 &&
    PLUGIN_ID_RE.test(id) &&
    !/^\.+$/.test(id)
  );
}

export function isWithin(parentDir: string, candidate: string): boolean {
  const base = normalize(resolve(parentDir)) + sep;
  const target = normalize(resolve(candidate));
  return target === normalize(parentDir) || target.startsWith(base);
}

function pickString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return undefined;
  return trimmed;
}

const LAYOUT_ELEMENT_RE = /^[a-z][a-z0-9-]{0,40}$/;

function sanitizeLayoutElements(value: unknown): PluginLayoutElement[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return undefined;
  const seen = new Set<string>();
  const out: PluginLayoutElement[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const element = pickString(o.element, 80);
    const variant = pickString(o.variant, 40);
    if (!element || !variant || !LAYOUT_ELEMENT_RE.test(variant)) continue;
    const key = `${element}\u0000${variant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      element,
      variant,
      label: pickString(o.label, 80)
    });
  }
  return out.length > 0 ? out : undefined;
}

export function sanitizePermissions(value: unknown): PluginPermissions {
  const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const permissions: PluginPermissions = {};
  if (o.storage === true) permissions.storage = true;
  if (o.notifications === true) permissions.notifications = true;
  if (o.player === true) permissions.player = true;
  if (o.visual === true) permissions.visual = true;
  if (o.network && typeof o.network === 'object') {
    const allow = (o.network as Record<string, unknown>).allow;
    if (Array.isArray(allow)) {
      const patterns = allow
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.slice(0, 500))
        .filter((p) => p.length > 0);
      if (patterns.length > 0) permissions.network = { allow: patterns };
    }
  }
  return permissions;
}

export function parseManifest(raw: unknown, folderId: string): ParsedManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { manifest: {} as PluginManifest, error: 'manifest:not-object' };
  }
  const o = raw as Record<string, unknown>;
  const name = pickString(o.name, 80);
  const version = pickString(o.version, 24);
  if (!name) return { manifest: {} as PluginManifest, error: 'manifest:missing-name' };
  if (!version) return { manifest: {} as PluginManifest, error: 'manifest:missing-version' };
  const entry = pickString(o.entry, 200);
  if (!entry || !PLUGIN_ENTRY_RE.test(entry) || entry.includes('..')) {
    return { manifest: {} as PluginManifest, error: 'manifest:bad-entry' };
  }
  const hooks = Array.isArray(o.hooks)
    ? o.hooks.filter((h): h is string => typeof h === 'string' && h.length <= 64)
    : [];
  const permissions = sanitizePermissions(o.permissions);
  const layoutElements =
    permissions.visual === true ? sanitizeLayoutElements(o.layoutElements) : undefined;
  return {
    manifest: {
      id: folderId,
      name,
      version,
      description: pickString(o.description, 300),
      author: pickString(o.author, 120),
      entry,
      apiVersion: pickString(o.apiVersion, 8) || '1',
      permissions,
      hooks,
      settings: sanitizeSettings(o.settings),
      ...(layoutElements ? { layoutElements } : {})
    }
  };
}

const SETTING_TYPES = ['text', 'boolean', 'number'];

function sanitizeSettings(value: unknown): PluginSettingField[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) return undefined;
  const seen = new Set<string>();
  const fields: PluginSettingField[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    if (!validStorageKey(o.key) || seen.has(o.key)) continue;
    const type = typeof o.type === 'string' && SETTING_TYPES.includes(o.type) ? o.type : undefined;
    if (!type) continue;
    const min = typeof o.min === 'number' && Number.isFinite(o.min) ? o.min : undefined;
    const max = typeof o.max === 'number' && Number.isFinite(o.max) ? o.max : undefined;
    const def = sanitizeStoredObject({ [o.key]: o.default })[o.key];
    seen.add(o.key);
    fields.push({
      key: o.key,
      label: pickString(o.label, 80) ?? o.key,
      type: type as PluginSettingField['type'],
      ...(def !== undefined ? { default: def } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {})
    });
  }
  return fields.length > 0 ? fields : undefined;
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

export interface PluginStateFile {
  [id: string]: { enabled?: boolean };
}

export async function loadStateFile(filePath: string): Promise<PluginStateFile> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PluginStateFile = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!validatePluginId(id)) continue;
      const v = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
      out[id] = { enabled: v.enabled === true };
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveStateFile(filePath: string, state: PluginStateFile): Promise<void> {
  await mkdir(resolve(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(state), 'utf-8');
  await rename(tmp, filePath).catch(() => writeFile(filePath, JSON.stringify(state), 'utf-8'));
}

export async function readStorageFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return sanitizeStoredObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function writeStorageFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  const sanitized = sanitizeStoredObject(data);
  if (Object.keys(sanitized).length > MAX_STORAGE_KEYS) {
    throw new Error('storage:too-many-keys');
  }
  const json = JSON.stringify(sanitized);
  if (Buffer.byteLength(json, 'utf-8') > MAX_STORAGE_BYTES) {
    throw new Error('storage:too-large');
  }
  await mkdir(resolve(filePath, '..'), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, json, 'utf-8');
  await rename(tmp, filePath).catch(() => writeFile(filePath, json, 'utf-8'));
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
  const escaped = parts
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
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