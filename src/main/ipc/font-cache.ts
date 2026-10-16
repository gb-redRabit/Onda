import { createHash } from 'crypto';
import { mkdir, readFile, writeFile, stat, rm } from 'fs/promises';
import { dirname, join } from 'path';
import os from 'os';
import { logger } from '../../shared/logger';
import { safeUserDataPath } from '../utils/profile-state';

// Trwały cache czcionek napisów (załączniki MKV). Ekstrakcja (ffprobe + mkvextract/
// ffmpeg) była powtarzana przy KAŻDYM otwarciu tego samego pliku — tu wynik jest
// zapisywany w profilu i wznawiany, dopóki plik źródłowy się nie zmieni.
//
// Klucz wideo = hash ścieżki + stempel rozmiaru/mtime, więc po edycji pliku cache
// jest automatycznie unieważniany. Pliki czcionek są adresowane treścią (sha1 bajtów),
// co odsila konflikty przy generycznych nazwach (np. `font.ttf`) i deduplikuje
// te same czcionki między plikami.

export interface CachedFont {
  name: string;
  ext: string;
  data: number[];
}

interface FontEntry {
  ext: string;
  size: number;
  usedAt: number;
}

interface FontRef {
  hash: string;
  name: string;
}

interface VideoEntry {
  stamp: string;
  fonts: FontRef[];
  usedAt: number;
}

interface FontCacheIndex {
  fonts: Record<string, FontEntry>;
  videos: Record<string, VideoEntry>;
}

// Budżet dyskowy cache. Po przekroczeniu najstarsze (LRU) wpisy wideo są usuwane
// razem z plikami czcionek, do których już nic nie odwołuje się.
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

let cacheDir: string | null = null;
export function getFontCacheDir(): string {
  if (!cacheDir) {
    const userData = safeUserDataPath();
    cacheDir = userData ? join(userData, 'font-cache') : join(os.tmpdir(), 'onda', 'font-cache');
  }
  return cacheDir;
}

function indexPath(): string {
  return join(getFontCacheDir(), 'index.json');
}

let index: FontCacheIndex | null = null;
let writeLock: Promise<void> | null = null;

async function loadIndex(): Promise<FontCacheIndex> {
  if (index) return index;
  try {
    const raw = await readFile(indexPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FontCacheIndex>;
    index = {
      fonts: parsed.fonts && typeof parsed.fonts === 'object' ? parsed.fonts : {},
      videos: parsed.videos && typeof parsed.videos === 'object' ? parsed.videos : {}
    };
  } catch {
    // brak pliku lub uszkodzony JSON — zaczynamy od pustego cache
    index = { fonts: {}, videos: {} };
  }
  return index;
}

async function saveIndex(): Promise<void> {
  while (writeLock) await writeLock;
  let release!: () => void;
  writeLock = new Promise((r) => {
    release = r;
  });
  try {
    const file = indexPath();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(index ?? { fonts: {}, videos: {} }), 'utf-8');
  } catch (e) {
    logger.warn('fontCache', 'saveIndex failed', e);
  } finally {
    writeLock = null;
    release();
  }
}

function sha1(input: string | Buffer): string {
  return createHash('sha1').update(input).digest('hex');
}

/** Klucz i stempel pliku wideo; null, gdy plik jest nieosiągalny. */
async function videoCacheKey(filePath: string): Promise<{ id: string; stamp: string } | null> {
  try {
    const s = await stat(filePath);
    return { id: sha1(filePath), stamp: `${s.size}:${Math.round(s.mtimeMs)}` };
  } catch (e) {
    logger.warn('fontCache', `stat failed for ${filePath}`, e);
    return null;
  }
}

function fontFile(dir: string, hash: string, ext: string): string {
  return join(dir, `${hash}.${ext}`);
}

/** Zwraca zapisane czcionki dla pliku albo null (brak/wpisy nieaktualne). */
export async function readCachedFonts(filePath: string): Promise<CachedFont[] | null> {
  const key = await videoCacheKey(filePath);
  if (!key) return null;
  const idx = await loadIndex();
  const entry = idx.videos[key.id];
  if (!entry || entry.stamp !== key.stamp) return null;

  const dir = getFontCacheDir();
  const fonts: CachedFont[] = [];
  for (const ref of entry.fonts) {
    const fe = idx.fonts[ref.hash];
    if (!fe) return null; // niekompletny wpis — traktuj jak miss
    try {
      const buf = await readFile(fontFile(dir, ref.hash, fe.ext));
      fonts.push({ name: ref.name, ext: fe.ext, data: Array.from(buf) });
    } catch (e) {
      logger.warn('fontCache', `cached font missing (${ref.hash})`, e);
      return null;
    }
  }
  entry.usedAt = Date.now();
  await saveIndex();
  return fonts;
}

async function evict(idx: FontCacheIndex, dir: string, maxBytes: number): Promise<void> {
  let total = 0;
  for (const f of Object.values(idx.fonts)) total += f.size || 0;
  if (total <= maxBytes) return;

  const videos = Object.entries(idx.videos).sort((a, b) => a[1].usedAt - b[1].usedAt);
  for (const [id, v] of videos) {
    if (total <= maxBytes) break;
    delete idx.videos[id];
    for (const ref of v.fonts) {
      const stillReferenced = Object.values(idx.videos).some((x) =>
        x.fonts.some((f) => f.hash === ref.hash)
      );
      if (stillReferenced) continue;
      const fe = idx.fonts[ref.hash];
      if (!fe) continue;
      await rm(fontFile(dir, ref.hash, fe.ext), { force: true }).catch(() => {
        /* best-effort: brak pliku nie blokuje zwolnienia wpisu */
      });
      total -= fe.size || 0;
      delete idx.fonts[ref.hash];
    }
  }
}

/** Zapisuje czcionki pliku do trwałego cache i przycina go do budżetu. */
export async function writeCachedFonts(
  filePath: string,
  fonts: CachedFont[],
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<void> {
  const key = await videoCacheKey(filePath);
  if (!key) return;
  const idx = await loadIndex();
  const dir = getFontCacheDir();
  await mkdir(dir, { recursive: true });

  const refs: FontRef[] = [];
  for (const f of fonts) {
    const buf = Buffer.from(f.data);
    const hash = sha1(buf);
    refs.push({ hash, name: f.name });
    const existing = idx.fonts[hash];
    if (existing) {
      existing.usedAt = Date.now();
      continue;
    }
    try {
      await writeFile(fontFile(dir, hash, f.ext), buf);
      idx.fonts[hash] = { ext: f.ext, size: buf.length, usedAt: Date.now() };
    } catch (e) {
      logger.warn('fontCache', `failed to persist font ${f.name}`, e);
    }
  }

  idx.videos[key.id] = { stamp: key.stamp, fonts: refs, usedAt: Date.now() };
  await evict(idx, dir, maxBytes);
  await saveIndex();
}

export async function fontCacheStats(): Promise<{ files: number; bytes: number; videos: number }> {
  const idx = await loadIndex();
  let bytes = 0;
  const fonts = Object.values(idx.fonts);
  for (const f of fonts) bytes += f.size || 0;
  return { files: fonts.length, bytes, videos: Object.keys(idx.videos).length };
}

export async function clearFontCache(): Promise<{ removed: number; bytesFreed: number }> {
  const idx = await loadIndex();
  const dir = getFontCacheDir();
  let removed = 0;
  let bytesFreed = 0;
  for (const [hash, fe] of Object.entries(idx.fonts)) {
    try {
      await rm(fontFile(dir, hash, fe.ext), { force: true });
      removed++;
      bytesFreed += fe.size || 0;
    } catch (e) {
      logger.warn('fontCache', `failed to remove ${hash}`, e);
    }
  }
  idx.fonts = {};
  idx.videos = {};
  await saveIndex();
  return { removed, bytesFreed };
}

/** Tylko do testów: czyści stan w pamięci, aby ponownie wczytać indeks z dysku. */
export function resetFontCacheForTests(): void {
  index = null;
  cacheDir = null;
}
