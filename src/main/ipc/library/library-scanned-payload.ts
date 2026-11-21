import type { MediaFile } from '../../../shared/types/media';
import { MAX_SCANNED_FILES } from './library-handlers-scan';

export interface ScannedPatch {
  upsertFiles: MediaFile[];
  removePaths: string[];
  folderTypes?: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
}

function sanitizeFiles(input: unknown, limit: number): MediaFile[] | null {
  if (!Array.isArray(input)) return null;
  return input
    .filter(
      (file): file is MediaFile =>
        !!file &&
        typeof file === 'object' &&
        typeof (file as MediaFile).path === 'string' &&
        typeof (file as MediaFile).name === 'string' &&
        ['audio', 'video', 'image'].includes((file as MediaFile).type)
    )
    .slice(0, limit);
}

function sanitizeRemovePaths(input: unknown, limit: number): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const path = value.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
    if (out.length >= limit) break;
  }
  return out;
}

function sanitizeFolderTypes(input: unknown): ScannedPatch['folderTypes'] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const folderTypes: NonNullable<ScannedPatch['folderTypes']> = {};
  for (const [folder, type] of Object.entries(input)) {
    if (
      typeof folder === 'string' &&
      (type === 'audio' || type === 'video' || type === 'image' || type === 'mixed')
    ) {
      folderTypes[folder] = type;
    }
  }
  return folderTypes;
}

/**
 * Waliduje ładunek `library:saveScanned` z renderera. To patch, nie pełny
 * snapshot: renderer nie może przypadkiem wyczyścić biblioteki, a rozmiar IPC
 * jest proporcjonalny do faktycznej zmiany (tagi, znikające pliki).
 */
export function sanitizeScannedPatch(
  input: unknown,
  limit = MAX_SCANNED_FILES
): ScannedPatch | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as {
    upsertFiles?: unknown;
    removePaths?: unknown;
    folderTypes?: unknown;
  };
  if (
    source.upsertFiles === undefined &&
    source.removePaths === undefined &&
    source.folderTypes === undefined
  ) {
    return null;
  }

  const upsertFiles =
    source.upsertFiles === undefined ? [] : sanitizeFiles(source.upsertFiles, limit);
  if (!upsertFiles) return null;
  const removePaths =
    source.removePaths === undefined ? [] : sanitizeRemovePaths(source.removePaths, limit);
  if (!removePaths) return null;
  const folderTypes =
    source.folderTypes === undefined ? undefined : sanitizeFolderTypes(source.folderTypes);
  if (source.folderTypes !== undefined && !folderTypes) return null;

  return { upsertFiles, removePaths, ...(folderTypes ? { folderTypes } : {}) };
}
