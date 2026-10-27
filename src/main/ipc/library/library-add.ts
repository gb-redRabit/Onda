import { dirname } from 'path';
import type { MediaFile } from '../../../shared/types/media';
import type { LibraryScannedData } from './library-store';

export interface AddedFilesMerge {
  files: MediaFile[];
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
  /** Liczba nowych plików (duplikaty pominięte). */
  added: number;
  /** Katalogi nowych plików — trzeba je dodać do allowlisty serwera mediów. */
  dirs: string[];
}

/**
 * Scala wynik skanu pojedynczych plików z biblioteką. Czyni to jako czysta funkcja,
 * bo logika duplikatów i klasyfikacji folderów jest zbyt łatwa do rozjechania w handlerze.
 */
export function mergeAddedFiles(
  data: LibraryScannedData,
  scanned: readonly MediaFile[]
): AddedFilesMerge {
  const existing = new Set(data.files.map((file) => file.path));
  const files = [...data.files];
  const folderTypes = { ...data.folderTypes };
  const dirs = new Set<string>();
  let added = 0;

  for (const file of scanned) {
    if (existing.has(file.path)) continue;
    existing.add(file.path);
    files.push(file);
    added += 1;

    const dir = dirname(file.path);
    const bucket = file.type === 'audio' ? 'audio' : file.type === 'video' ? 'video' : 'image';
    const current = folderTypes[dir];
    if (!current) folderTypes[dir] = bucket;
    else if (current !== bucket) folderTypes[dir] = 'mixed';
    dirs.add(dir);
  }

  return { files, folderTypes, added, dirs: [...dirs] };
}
