import { cp, mkdir, readFile, readdir, rm, stat } from 'fs/promises';
import { join, resolve, sep } from 'path';
import type {
  IpcPluginInstallResult,
  PluginExample,
  PluginInfo,
  PluginManifest
} from '../../../shared/types/ipc';
import {
  isWithin,
  parseManifest,
  validatePluginId,
  MAX_MANIFEST_BYTES,
  pluginCapabilityHash
} from './plugins-core';

// Dołączone przykładowe pluginy dostarczane w `resources/plugins-examples/<id>` (sekcja
// Ustawienia → Pluginy "Przykłady" instaluje je jednym kliknięciem). Trzymane jako
// czyste helpery fs, aby można je było testować jednostkowo; handler IPC dostarcza
// ścieżki resources/userData. Instalacja nigdy nie włącza pluginu automatycznie.

async function readManifest(dir: string, folderId: string): Promise<PluginManifest | null> {
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

/** Metadane przykładowych pluginów dostępnych w `examplesDir` (posortowane po nazwie). */
export async function listPluginExamples(examplesDir: string): Promise<PluginExample[]> {
  const entries = await readdir(examplesDir, { withFileTypes: true }).catch(() => []);
  const out: PluginExample[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !validatePluginId(entry.name)) continue;
    const manifest = await readManifest(join(examplesDir, entry.name), entry.name);
    if (!manifest) continue;
    out.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      permissions: manifest.permissions,
      hooks: manifest.hooks,
      layoutElements: manifest.layoutElements,
      uiSlots: manifest.uiSlots
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Instaluje `sourceDir` (zaufane: dołączone przykłady; dialog folderu ma własną
 * walidację) w `destBase/<folderId>`, zastępując istniejącą instalację.
 */
export async function installPluginFromDir(
  sourceDir: string,
  destBase: string,
  folderId: string
): Promise<IpcPluginInstallResult> {
  if (!validatePluginId(folderId)) {
    return { success: false, error: 'Invalid plugin id' };
  }
  const manifest = await readManifest(sourceDir, folderId);
  if (!manifest) return { success: false, error: 'Invalid manifest' };
  try {
    if (!(await stat(resolve(sourceDir, manifest.entry))).isFile()) {
      return { success: false, error: 'Entry file missing' };
    }
  } catch {
    return { success: false, error: 'Entry file missing' };
  }
  await mkdir(destBase, { recursive: true });
  const dest = join(destBase, manifest.id);
  await rm(dest, { recursive: true, force: true });
  await cp(sourceDir, dest, {
    recursive: true,
    filter: (src) =>
      !src.includes(`${sep}node_modules${sep}`) && !src.endsWith(`${sep}node_modules`)
  });
  const installed = await readManifest(dest, manifest.id);
  if (!installed) return { success: false, error: 'Installed plugin invalid' };
  const info: PluginInfo = {
    id: installed.id,
    name: installed.name,
    version: installed.version,
    description: installed.description,
    author: installed.author,
    enabled: false,
    permissions: installed.permissions,
    hooks: installed.hooks,
    layoutElements: installed.layoutElements,
    uiSlots: installed.uiSlots,
    capabilityHash: pluginCapabilityHash(installed)
  };
  return { success: true, installed: info };
}
