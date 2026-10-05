import { app } from 'electron';
import { join, sep, resolve } from 'path';
import { readdir, readFile, mkdir } from 'fs/promises';
import type { PluginInfo, PluginManifest } from '../../../shared/types/ipc';
import { logger } from '../../../shared/logger';
import {
  validatePluginId,
  isWithin,
  parseManifest,
  loadStateFile,
  saveStateFile,
  readStorageFile,
  writeStorageFile,
  normalizePluginSettings,
  sha256Hex,
  pluginCapabilityHash,
  pluginApprovalMatches,
  MAX_MANIFEST_BYTES,
  MAX_ENTRY_BYTES,
  MAX_PLUGINS
} from './plugins-core';
import type { PluginStateFile } from './plugins-core';

// Ścieżki, odczyt manifestu/wejścia, stan włączenia i storage/settings pluginów —
// wyodrębnione z `plugins-handlers.ts`, żeby rejestracja IPC była cienka.

let pluginsDir: string | null = null;
let pluginsDataDir: string | null = null;

export function getPluginsDir(): string {
  if (!pluginsDir) pluginsDir = join(app.getPath('userData'), 'plugins');
  return pluginsDir;
}

export function getPluginsDataDir(): string {
  if (!pluginsDataDir) pluginsDataDir = join(app.getPath('userData'), 'plugins-data');
  return pluginsDataDir;
}

// Dołączone przykłady są dostarczane w bundlu aplikacji: dev `out/main` → repo
// `resources/`, spakowane `app.asar/out/main` → `app.asar/resources/`.
export function getExamplesDir(): string {
  return join(__dirname, '../../resources/plugins-examples');
}

export function stateFilePath(): string {
  return join(app.getPath('userData'), 'plugins-state.json');
}

export function pluginStorageFile(id: string): string {
  return join(getPluginsDataDir(), id, 'storage.json');
}

export function pluginSettingsFile(id: string): string {
  return join(getPluginsDataDir(), id, 'settings.json');
}

export async function readManifest(dir: string, folderId: string): Promise<PluginManifest | null> {
  try {
    const raw = await readFile(join(dir, 'manifest.json'), 'utf-8');
    if (Buffer.byteLength(raw, 'utf-8') > MAX_MANIFEST_BYTES) return null;
    if (!validatePluginId(folderId)) return null;
    const { manifest, error } = parseManifest(JSON.parse(raw), folderId);
    if (error || !manifest) return null;
    if (!isWithin(dir, resolve(dir, manifest.entry))) return null;
    return manifest;
  } catch {
    return null;
  }
}

async function readManifestSafe(dir: string): Promise<PluginInfo | null> {
  const folderId = dir.split(sep).pop() || '';
  const manifest = await readManifest(dir, folderId);
  if (!manifest) return null;
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    enabled: false,
    permissions: manifest.permissions,
    hooks: manifest.hooks,
    layoutElements: manifest.layoutElements,
    uiSlots: manifest.uiSlots,
    capabilityHash: pluginCapabilityHash(manifest)
  };
}

export async function listInstalledPlugins(): Promise<PluginInfo[]> {
  const base = getPluginsDir();
  await mkdir(base, { recursive: true });
  const entries = await readdir(base, { withFileTypes: true });
  const found: PluginInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !validatePluginId(entry.name)) continue;
    const dir = join(base, entry.name);
    const info = await readManifestSafe(dir);
    if (info) found.push(info);
    if (found.length >= MAX_PLUGINS) break;
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readManifestById(id: string): Promise<PluginManifest | null> {
  if (!validatePluginId(id)) return null;
  return readManifest(join(getPluginsDir(), id), id);
}

export function loadEnabledState(): Promise<PluginStateFile> {
  return loadStateFile(stateFilePath());
}

export async function setEnabled(
  id: string,
  enabled: boolean,
  approvedConsent?: string | null
): Promise<void> {
  const state = await loadEnabledState();
  if (approvedConsent === null) {
    state[id] = { enabled };
  } else if (typeof approvedConsent === 'string') {
    state[id] = { enabled, approvedConsent };
  } else {
    state[id] = { ...state[id], enabled };
  }
  await saveStateFile(stateFilePath(), state);
}

export async function readPluginEntry(
  dir: string,
  id: string,
  manifest?: PluginManifest | null
): Promise<string | null> {
  try {
    const resolved = manifest ?? (await readManifest(dir, id));
    if (!resolved) return null;
    const entryPath = resolve(dir, resolved.entry);
    const entry = await readFile(entryPath, 'utf-8');
    if (Buffer.byteLength(entry, 'utf-8') > MAX_ENTRY_BYTES) return null;
    return entry;
  } catch {
    return null;
  }
}

/** SHA-256 pliku wejściowego pluginu, aby zgoda była związana z faktycznym kodem. */
export async function readEntryDigest(
  dir: string,
  id: string,
  manifest?: PluginManifest | null
): Promise<string | null> {
  const code = await readPluginEntry(dir, id, manifest);
  return code === null ? null : sha256Hex(code);
}

/**
 * Manifest, ale tylko dla pluginu, który jest OBECNIE zatwierdzony.
 *
 * Każdy kanał możliwości (storage, ustawienia, sieć) musi to przejść, a nie
 * tylko sprawdzić manifest. Manifest mówi, co plugin DEKLARUJE; to jest to,
 * co użytkownik ZATWIERDZIŁ, ponownie zweryfikowane względem digestu wejścia, aby edycja
 * kodu lub rozszerzenie uprawnień po fakcie cofnęła nadanie.
 *
 * Bez tego zainstalowany, ale nigdy niezatwierdzony plugin nadal sięgał do własnego
 * storage i allowlisty sieciowej przez IPC, bo handlery możliwości
 * patrzyły wyłącznie na manifest.
 */
export async function approvedManifest(id: string): Promise<PluginManifest | null> {
  if (!validatePluginId(id)) return null;
  const saved = (await loadEnabledState())[id];
  if (saved?.enabled !== true || !saved.approvedConsent) return null;
  const dir = join(getPluginsDir(), id);
  const digest = await readEntryDigest(dir, id);
  if (!digest) return null;
  const manifest = await readManifest(dir, id);
  if (!manifest || !pluginApprovalMatches(manifest, digest, saved.approvedConsent)) return null;
  return manifest;
}

/**
 * Plugin pozostaje włączony tylko dopóki zapisana zgoda wciąż pasuje do bieżącego
 * manifestu ORAZ digestu wejścia, więc edycja kodu lub możliwości pluginu wymusza
 * świeży przegląd, zamiast po cichu uruchamiać niezatwierdzony kod po restarcie.
 */
export async function mergeInfos(
  plugins: PluginInfo[],
  state: PluginStateFile
): Promise<PluginInfo[]> {
  const out: PluginInfo[] = [];
  for (const plugin of plugins) {
    const saved = state[plugin.id];
    let consentApproved = false;
    if (saved?.enabled === true && saved.approvedConsent) {
      const dir = join(getPluginsDir(), plugin.id);
      // Wczytaj manifest raz i użyj ponownie do digestu: `readEntryDigest`
      // potrzebuje manifestu tylko do zlokalizowania `entry`.
      const manifest = await readManifest(dir, plugin.id);
      if (manifest) {
        const digest = await readEntryDigest(dir, plugin.id, manifest);
        consentApproved =
          !!digest && pluginApprovalMatches(manifest, digest, saved.approvedConsent);
      }
    }
    const permissionReviewRequired = saved?.enabled === true && !consentApproved;
    out.push({
      ...plugin,
      enabled: saved?.enabled === true && consentApproved,
      permissionReviewRequired
    });
  }
  return out;
}

export async function storageData(id: string): Promise<Record<string, unknown>> {
  const base = getPluginsDataDir();
  await mkdir(join(base, id), { recursive: true });
  return readStorageFile(pluginStorageFile(id));
}

/**
 * Wczytuje zapisane ustawienia pluginu i migruje je do bieżącego schematu
 * manifestu: niezadeklarowane klucze są odrzucane, a wartości poza schematem spadają do
 * poprawnego domyślnego. Plik jest przepisywany raz, aby migracja nie powtarzała się
 * przy każdym odczycie.
 */
export async function settingsData(
  id: string,
  manifest?: PluginManifest | null
): Promise<Record<string, unknown>> {
  const base = getPluginsDataDir();
  await mkdir(join(base, id), { recursive: true });
  const file = pluginSettingsFile(id);
  const stored = await readStorageFile(file);
  if (!manifest?.settings?.length) return stored;
  const { value, changed } = normalizePluginSettings(manifest, stored);
  if (changed) {
    try {
      await writeStorageFile(file, value);
    } catch (e) {
      logger.warn('plugins', 'settings migration write failed', e);
    }
  }
  return value;
}
