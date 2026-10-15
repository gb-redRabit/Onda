import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { RemoteItem } from '../../../shared/types/providers';

// Trwały cache providerów, żeby ograniczyć liczbę zapytań do serwisów (PikPak itd.).
// - FOLDERY: cache na stałe (JSON w userData) — odświeżanie TYLKO ręczne (przycisk „Odśwież"),
//   limit 300 wpisów (LRU).
// - PLIKI (rozwiązany URL): cache w pamięci z TTL 10 min (podpisane linki żyją ~2h).
//
// `electron`/`fs` importowane dynamicznie, żeby import modułu nie wymagał Electrona
// (np. w testach registry/providerów) — bez userData cache jest po prostu wyłączony.

interface FolderEntry {
  items: RemoteItem[];
  at: number;
}
interface FileEntry {
  url: string;
  headers?: Record<string, string>;
  at: number;
}

const FOLDER_MAX = 300;
const FILE_MAX = 1000;
const FILE_TTL_MS = 10 * 60 * 1000;

const folders = new Map<string, FolderEntry>(); // kolejność = LRU (najnowsze na końcu)
const files = new Map<string, FileEntry>();

let loaded = false;
let cacheEnabled = false;
let loadPromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function cacheFile(): Promise<string | null> {
  try {
    const { app } = await import('electron');
    return join(app.getPath('userData'), 'providers-cache.json');
  } catch {
    return null;
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const path = await cacheFile();
      if (!path) return;
      cacheEnabled = true;
      try {
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as { folders?: Record<string, FolderEntry> };
        for (const [k, v] of Object.entries(data.folders || {})) {
          if (v && Array.isArray(v.items)) folders.set(k, v);
        }
        evictFolders();
      } catch {
        // brak/niepoprawny plik — start z pustym cache
      }
    })();
  }
  await loadPromise;
  loaded = true;
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persist();
  }, 500);
}

async function persist(): Promise<void> {
  const path = await cacheFile();
  if (!path) return;
  try {
    await mkdir(join(path, '..'), { recursive: true });
    const data = { folders: Object.fromEntries(folders) };
    await writeFile(path, JSON.stringify(data), 'utf-8');
  } catch {
    // zapis cache jest niekrytyczny
  }
}

function evictFolders(): void {
  while (folders.size > FOLDER_MAX) {
    const oldest = folders.keys().next().value;
    if (oldest === undefined) break;
    folders.delete(oldest);
  }
}

export async function getCachedFolder(key: string): Promise<RemoteItem[] | null> {
  await ensureLoaded();
  if (!cacheEnabled) return null;
  const entry = folders.get(key);
  if (!entry) return null;
  // odśwież pozycję LRU
  folders.delete(key);
  folders.set(key, entry);
  return entry.items;
}

export async function setCachedFolder(key: string, items: RemoteItem[]): Promise<void> {
  await ensureLoaded();
  if (!cacheEnabled) return;
  folders.set(key, { items, at: Date.now() });
  evictFolders();
  scheduleSave();
}

export async function getCachedFileUrl(
  key: string
): Promise<{ url: string; headers?: Record<string, string> } | null> {
  await ensureLoaded();
  if (!cacheEnabled) return null;
  const entry = files.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > FILE_TTL_MS) {
    files.delete(key);
    return null;
  }
  // odśwież pozycję LRU
  files.delete(key);
  files.set(key, entry);
  return { url: entry.url, headers: entry.headers };
}

export async function setCachedFileUrl(
  key: string,
  url: string,
  headers?: Record<string, string>
): Promise<void> {
  await ensureLoaded();
  if (!cacheEnabled) return;
  files.set(key, { url, headers, at: Date.now() });
  while (files.size > FILE_MAX) {
    const oldest = files.keys().next().value;
    if (oldest === undefined) break;
    files.delete(oldest);
  }
}

// Natychmiast zapisuje cache na dysk (anuluje debounce) — wywoływane przy zamykaniu.
export async function flushProviderCache(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await persist();
}

// Dla testów: czyści cały cache w pamięci.
export function __resetProviderCache(): void {
  folders.clear();
  files.clear();
  loaded = false;
  loadPromise = null;
}
