import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import os from 'os';
import { logger } from '../../shared/logger';
import { extractAndCacheCover } from '../ipc/cover/cover-cache';
import { isServableMediaPath } from '../media/media-paths';
import { safeUserDataPath } from '../utils/profile-state';
import { isSafeAbsolutePath } from '../utils/validate';

// Discord pobiera okładki przez własne proxy, więc obraz z dysku musi mieć
// publiczny adres. Wysyłamy wyłącznie obraz okładki (bez audio i metadanych) na
// catbox.moe — opcja jest domyślnie wyłączona w ustawieniach.

const CATBOX_URL = 'https://catbox.moe/user/api.php';
const UPLOAD_TIMEOUT_MS = 20_000;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 500;
const ALLOWED_UPLOAD_HOST = 'files.catbox.moe';

interface UploadEntry {
  url: string;
  mtime: number;
  at: number;
}

interface ParsedCover {
  buffer: Buffer;
  mime: string;
  ext: string;
}

let uploadsFile: string | null = null;
let uploads: Record<string, UploadEntry> | null = null;
let writeLock: Promise<void> | null = null;
const pending = new Map<string, Promise<string | null>>();

function getUploadsFile(): string {
  if (!uploadsFile) {
    const userData = safeUserDataPath();
    uploadsFile = userData
      ? join(userData, 'discord-cover-uploads.json')
      : join(os.tmpdir(), 'onda', 'discord-cover-uploads.json');
  }
  return uploadsFile;
}

async function readUploads(): Promise<Record<string, UploadEntry>> {
  if (uploads) return uploads;
  try {
    const parsed = JSON.parse(await readFile(getUploadsFile(), 'utf-8')) as unknown;
    uploads = parsed && typeof parsed === 'object' ? (parsed as Record<string, UploadEntry>) : {};
  } catch {
    uploads = {};
  }
  return uploads;
}

// Wywołujący (`recordUpload`) trzyma zamek zapisu.
async function saveUploads(data: Record<string, UploadEntry>): Promise<void> {
  const file = getUploadsFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf-8');
  uploads = data;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Dekoduje data URL zwrócony przez `extractAndCacheCover`; odrzuca nieobrazy. */
export function parseCoverDataUrl(data: unknown): ParsedCover | null {
  if (typeof data !== 'string') return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_COVER_BYTES) return null;
  const mime = `image/${match[1]}`;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  return { buffer, mime, ext };
}

/** Catbox zwraca goły URL — akceptujemy tylko jego domenę i HTTPS. */
export function isAllowedUploadUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== ALLOWED_UPLOAD_HOST) return null;
  return url.toString();
}

async function uploadToCatbox(buffer: Buffer, mime: string, ext: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append(
      'fileToUpload',
      new Blob([new Uint8Array(buffer)], { type: mime }),
      `onda-cover.${ext}`
    );
    const response = await fetch(CATBOX_URL, {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    if (!response.ok) {
      logger.info('discord', `cover upload failed: HTTP ${response.status}`);
      return null;
    }
    const url = isAllowedUploadUrl(await response.text());
    if (!url) logger.info('discord', 'cover upload returned an unexpected URL');
    return url;
  } catch (error) {
    logger.info('discord', `cover upload failed: ${errorMessage(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function recordUpload(filePath: string, mtime: number, url: string): Promise<void> {
  // Odczyt i zapis pod jednym zamkiem, żeby równoległe uploady nie zgubiły wpisów.
  while (writeLock) await writeLock;
  let release: () => void;
  writeLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const data = await readUploads();
    const next: Record<string, UploadEntry> = {
      ...data,
      [filePath]: { url, mtime, at: Date.now() }
    };
    // Ogranicz mapę, żeby plik nie rósł bez końca; najstarsze wpisy wypadają.
    const entries = Object.entries(next).sort((a, b) => a[1].at - b[1].at);
    while (entries.length > MAX_ENTRIES) {
      const [key] = entries.shift()!;
      delete next[key];
    }
    await saveUploads(next);
  } finally {
    writeLock = null;
    release!();
  }
}

async function resolveUncached(filePath: string, mtimeMs: number): Promise<string | null> {
  const cover = await extractAndCacheCover(filePath);
  if (cover.type !== 'image' || !cover.data) return null;
  const parsed = parseCoverDataUrl(cover.data);
  if (!parsed) return null;

  const url = await uploadToCatbox(parsed.buffer, parsed.mime, parsed.ext);
  if (!url) return null;
  await recordUpload(filePath, mtimeMs, url);
  return url;
}

/**
 * Zwraca publiczny URL okładki dla lokalnego pliku. Wynik jest trwały (mapa
 * `discord-cover-uploads.json`) i unieważniany, gdy plik się zmieni.
 */
export async function resolveLocalCover(filePath: unknown): Promise<string | null> {
  if (!isSafeAbsolutePath(filePath) || !isServableMediaPath(filePath)) return null;
  const already = pending.get(filePath);
  if (already) return already;

  const request = (async () => {
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) return null;

    const data = await readUploads();
    const entry = data[filePath];
    if (entry && entry.mtime === info.mtimeMs) {
      // Mapa jest plikiem na dysku — nie ufamy jej bez walidacji hosta.
      const cached = isAllowedUploadUrl(entry.url);
      if (cached) return cached;
    }

    return resolveUncached(filePath, info.mtimeMs);
  })().finally(() => pending.delete(filePath));

  pending.set(filePath, request);
  return request;
}
