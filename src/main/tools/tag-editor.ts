import { basename, dirname, extname, join } from 'path';
import { stat } from 'fs/promises';
import NodeID3 from 'node-id3';
import { parseFile, type ICommonTagsResult } from 'music-metadata';
import { resolveBin } from '../binaries';
import { runCommand } from '../utils/exec';
import { isProtectedPath } from '../path-policy';
import { isSafeAbsolutePath } from '../utils/validate';
import { replaceFileAtomic, safeRm } from '../utils/fs-atomic';
import { logger } from '../../shared/logger';
import {
  AUDIO_TAG_FIELDS,
  TAG_EDITOR_MAX_FILES,
  type AudioTagField,
  type AudioTagFields,
  type TagEditorFile,
  type TagEditorWriteEntry,
  type TagEditorWriteResult
} from '../../shared/types/tools';

// Pola obsługiwane przez edytor (wspólna lista z rendererem).
export const TAG_FIELDS = AUDIO_TAG_FIELDS;
export type TagField = AudioTagField;

// Kontenery z bezpiecznym zapisem:
//  - ID3 (`.mp3`): node-id3 aktualizuje wyłącznie ramki ID3v2.
//  - reszta: ffmpeg z `-c copy` + `-metadata`, więc audio nie jest rekompresowane,
//    a metadane innych typów (Vorbis comments / atomy MP4 / INFO WAV) nie są niszczone.
const ID3_EXTENSIONS = new Set(['.mp3']);
const FFMPEG_EXTENSIONS = new Set(['.flac', '.m4a', '.m4b', '.ogg', '.oga', '.opus', '.wav']);
// Odczytać da się więcej formatów, niż bezpiecznie zapisać.
const READABLE_EXTENSIONS = new Set([
  ...ID3_EXTENSIONS,
  ...FFMPEG_EXTENSIONS,
  '.aac',
  '.wma',
  '.aiff',
  '.ape'
]);

const MAX_FIELD_LENGTH = 1024;

function fieldOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True, gdy dla danego formatu potrafimy bezpiecznie zapisać tagi. */
export function isWritableTagFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ID3_EXTENSIONS.has(ext) || FFMPEG_EXTENSIONS.has(ext);
}

/**
 * Normalizuje ładunek z renderera do znanych pól. Brak klucza = „nie zmieniaj",
 * pusty string = „wyczyść". Nieznane klucze są odrzucane.
 */
export function sanitizeTagFields(input: unknown): AudioTagFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const out: AudioTagFields = {};
  for (const field of TAG_FIELDS) {
    const value = fieldOf(source[field]);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

function joinedString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0
    );
    return parts.length > 0 ? parts.join('; ') : undefined;
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Mapuje wynik `music-metadata` na pola edytora (tylko ustawione wartości). */
export function tagsFromMetadata(common: Partial<ICommonTagsResult>): AudioTagFields {
  const tags: AudioTagFields = {};
  if (common.title) tags.title = common.title;
  if (common.artist) tags.artist = common.artist;
  if (common.album) tags.album = common.album;
  if (common.albumartist) tags.albumArtist = common.albumartist;
  const genre = joinedString(common.genre);
  if (genre) tags.genre = genre;
  if (common.year != null) tags.year = String(common.year);
  if (common.track?.no != null) tags.track = String(common.track.no);
  if (common.disk?.no != null) tags.disc = String(common.disk.no);
  return tags;
}

export async function readAudioTags(paths: unknown): Promise<TagEditorFile[]> {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const files: TagEditorFile[] = [];
  for (const raw of paths.slice(0, TAG_EDITOR_MAX_FILES)) {
    if (!isSafeAbsolutePath(raw)) {
      files.push({ path: String(raw), writable: false, tags: {}, error: 'Invalid path' });
      continue;
    }
    const filePath = raw;
    if (!READABLE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      files.push({
        path: filePath,
        writable: false,
        tags: {},
        error: 'Unsupported audio format'
      });
      continue;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('Not a file');
      const metadata = await parseFile(filePath, { duration: false });
      files.push({
        path: filePath,
        writable: isWritableTagFile(filePath),
        tags: tagsFromMetadata(metadata.common)
      });
    } catch (error) {
      files.push({
        path: filePath,
        writable: isWritableTagFile(filePath),
        tags: {},
        error: errMsg(error)
      });
    }
  }
  return files;
}

function buildId3Tags(tags: AudioTagFields): NodeID3.Tags {
  const id3: NodeID3.Tags = {};
  if (tags.title !== undefined) id3.title = tags.title;
  if (tags.artist !== undefined) id3.artist = tags.artist;
  if (tags.album !== undefined) id3.album = tags.album;
  if (tags.albumArtist !== undefined) id3.performerInfo = tags.albumArtist;
  if (tags.genre !== undefined) id3.genre = tags.genre;
  if (tags.year !== undefined) id3.year = tags.year;
  if (tags.track !== undefined) id3.trackNumber = tags.track;
  if (tags.disc !== undefined) id3.partOfSet = tags.disc;
  return id3;
}

/** Argumenty `-metadata` dla ffmpeg (mapowanie nazw pól edytora na standardowe klucze). */
export function buildTagMetadataArgs(tags: AudioTagFields): string[] {
  const mapping: Array<[string, string | undefined]> = [
    ['title', tags.title],
    ['artist', tags.artist],
    ['album', tags.album],
    ['album_artist', tags.albumArtist],
    ['genre', tags.genre],
    ['date', tags.year],
    ['track', tags.track],
    ['disc', tags.disc]
  ];
  const args: string[] = [];
  for (const [key, value] of mapping) {
    if (value !== undefined) args.push('-metadata', `${key}=${value}`);
  }
  return args;
}

async function writeFfmpegTags(filePath: string, tags: AudioTagFields): Promise<void> {
  const extension = extname(filePath);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Plik tymczasowy z tym samym rozszerzeniem, aby ffmpeg rozpoznał kontener.
  const tmpPath = join(
    dirname(filePath),
    `.${basename(filePath, extension)}.tags-${stamp}${extension}`
  );
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    filePath,
    '-map',
    '0',
    '-map_metadata',
    '0',
    '-c',
    'copy',
    ...buildTagMetadataArgs(tags),
    tmpPath
  ];
  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await runCommand(ffmpeg, args, { timeout: 60_000 });
    await replaceFileAtomic(tmpPath, filePath);
  } finally {
    await safeRm(tmpPath);
  }
}

async function writeId3Tags(filePath: string, tags: AudioTagFields): Promise<void> {
  const id3 = buildId3Tags(tags);
  // Pusty obiekt mógłby wyczyścić wszystkie ramki — traktujemy go jako no-op.
  if (Object.keys(id3).length === 0) return;
  await NodeID3.Promise.update(id3, filePath);
}

export async function writeAudioTags(entries: unknown): Promise<TagEditorWriteResult[]> {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const results: TagEditorWriteResult[] = [];
  for (const raw of entries.slice(0, TAG_EDITOR_MAX_FILES)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Partial<TagEditorWriteEntry>;
    const filePath = entry.path;
    if (!isSafeAbsolutePath(filePath)) {
      results.push({
        path: typeof filePath === 'string' ? filePath : '',
        success: false,
        error: 'Invalid path'
      });
      continue;
    }
    if (isProtectedPath(filePath)) {
      results.push({ path: filePath, success: false, error: 'Protected path' });
      continue;
    }
    if (!isWritableTagFile(filePath)) {
      results.push({
        path: filePath,
        success: false,
        error: 'Unsupported audio format for writing'
      });
      continue;
    }
    const tags = sanitizeTagFields(entry.tags);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('Not a file');
      if (ID3_EXTENSIONS.has(extname(filePath).toLowerCase())) {
        await writeId3Tags(filePath, tags);
      } else {
        await writeFfmpegTags(filePath, tags);
      }
      results.push({ path: filePath, success: true });
    } catch (error) {
      logger.warn('tools', `tag write failed for ${filePath}`, error);
      results.push({ path: filePath, success: false, error: errMsg(error) });
    }
  }
  return results;
}
