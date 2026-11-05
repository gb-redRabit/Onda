import type { MediaFile } from '../../../shared/types/media';
import { MAX_SCANNED_FILES } from './library-handlers-scan';

export interface ScannedPayload {
  files: MediaFile[];
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
}

/**
 * Waliduje ładunek `library:saveScanned` z renderera. Zły ładunek nie może
 * nadpisać biblioteki ani wstrzyknąć nieznanych typów folderów; poprawne pliki
 * zachowują wszystkie metadane i kolejność.
 */
export function sanitizeScannedPayload(
  input: unknown,
  limit = MAX_SCANNED_FILES
): ScannedPayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as { files?: unknown; folderTypes?: unknown };
  if (!Array.isArray(source.files)) return null;

  const files = source.files
    .filter(
      (file): file is MediaFile =>
        !!file &&
        typeof file === 'object' &&
        typeof (file as MediaFile).path === 'string' &&
        typeof (file as MediaFile).name === 'string' &&
        ['audio', 'video', 'image'].includes((file as MediaFile).type)
    )
    .slice(0, limit);

  const folderTypes: ScannedPayload['folderTypes'] = {};
  if (source.folderTypes && typeof source.folderTypes === 'object') {
    for (const [folder, type] of Object.entries(source.folderTypes)) {
      if (
        typeof folder === 'string' &&
        (type === 'audio' || type === 'video' || type === 'image' || type === 'mixed')
      ) {
        folderTypes[folder] = type;
      }
    }
  }

  return { files, folderTypes };
}
