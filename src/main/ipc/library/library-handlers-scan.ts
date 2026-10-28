import { stat } from 'fs/promises';
import type { MediaFile } from '../../../shared/types/media';
import { logger } from '../../../shared/logger';
import { broadcastToAllWindows } from '../../utils/broadcast';
import {
  classifyFolderType,
  createScanBudget,
  filterFilesForFolderType,
  scanDir
} from './library-scan';
import { loadLibraryScanned, setLibraryScanned } from './library-store';
import { sanitizeFolderPaths } from './library-handlers-paths';

export const MAX_SCANNED_FILES = 50000;

export type LibraryScanResult = {
  count: number;
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
  aborted: boolean;
  /** True, gdy limit plików zatrzymał przejście, więc biblioteka jest częściowa. */
  truncated: boolean;
};

export async function runLibraryScan(
  folderPaths: string[],
  signal: AbortSignal,
  onProgress?: (current: number, total: number) => void,
  broadcast = false
): Promise<LibraryScanResult> {
  // Budżet jest współdzielony między folderami, więc limit dotyczy całego skanowania
  // i przejście zatrzymuje się tam, gdzie limit zostaje osiągnięty, zamiast czytać
  // wszystko i odrzucać większość potem.
  const budget = createScanBudget(MAX_SCANNED_FILES);
  const folderResults: Array<{
    folderType: 'audio' | 'video' | 'image' | 'mixed';
    files: MediaFile[];
    folderPath: string;
  } | null> = [];

  const safePaths = sanitizeFolderPaths(folderPaths);
  const folderTotal = safePaths.length;
  let doneCount = 0;

  // Wczytaj poprzednie skanowanie, aby niezmienione pliki mogły być ponownie użyte
  // (skan przyrostowy) — zachowuje to playCount/lastPlayed i unika ponownego parsowania.
  const prevData = await loadLibraryScanned();
  const previous = new Map<string, MediaFile>();
  if (prevData && Array.isArray(prevData.files)) {
    for (const f of prevData.files) {
      if (f && typeof f.path === 'string') previous.set(f.path, f);
    }
  }

  // Skanuj foldery sekwencyjnie, aby nie wysycić dysku, emitując postęp na folder.
  for (const folderPath of safePaths) {
    if (signal.aborted) break;
    doneCount++;
    onProgress?.(doneCount, folderTotal);
    try {
      const s = await stat(folderPath).catch(() => null);
      if (!s || !s.isDirectory()) {
        logger.warn('library', `scan skipped (not a directory): ${folderPath}`);
        folderResults.push(null);
        continue;
      }
      const result = await scanDir(folderPath, 8, 0, signal, previous, budget);
      const folderType = classifyFolderType(result);
      folderResults.push({
        folderType,
        files: filterFilesForFolderType(result.files, folderType),
        folderPath
      });
    } catch (err) {
      logger.warn('library', `scan error for ${folderPath}: ${err}`);
      folderResults.push(null);
    }
  }

  const allFiles: MediaFile[] = [];
  const folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'> = {};
  for (const r of folderResults) {
    if (!r) continue;
    folderTypes[r.folderPath] = r.folderType;
    allFiles.push(...r.files);
  }

  // Zapisuj tylko jeśli skan się zakończył (nie przerwano/anulowano). Przerwanie
  // w trakcie zapisałoby niekompletną listę i praktycznie wyczyściło bibliotekę.
  if (!signal.aborted) {
    setLibraryScanned({ files: allFiles, folderTypes });
    if (broadcast) broadcastToAllWindows('library:updated');
  }

  if (budget.truncated) {
    // Ciche odrzucenie reszty wyglądałoby jak utrata danych albo jakby biblioteka
    // zapomniała plików. Powiedzmy o tym — użytkownik może podnieść limit lub podzielić
    // folder.
    logger.warn(
      'library',
      `scan hit the ${MAX_SCANNED_FILES} file ceiling — the library is incomplete`
    );
  }

  logger.info('library', `scan completed: ${allFiles.length} files`);
  return {
    count: allFiles.length,
    folderTypes,
    aborted: signal.aborted,
    truncated: budget.truncated
  };
}
