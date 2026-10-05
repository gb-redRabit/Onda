import { dirname, resolve, sep } from 'path';
import type { MediaFile } from '../../shared/types/media';
import { getStore } from '../ipc/cover/cover-cache';
import { loadLibraryScanned, setLibraryScanned } from '../ipc/library/library-store';
import { scanDir, classifyFolderType, filterFilesForFolderType } from '../ipc/library/library-scan';
import { addLibraryFolder } from '../ipc/library/library-handlers';
import { logger } from '../../shared/logger';
import { broadcastToAllWindows } from '../utils/broadcast';
import { createWriteLock } from '../utils/write-queue';

const MAX_SCANNED_FILES = 50000;

// Skan + scalanie + zapis całej biblioteki to read-modify-write współdzielonego
// cache. Przy MAX_CONCURRENT=8 równoległych pobrań dwie synchronizacje czytały ten
// sam stan, a ostatni zapis gubił wpisy drugiej. Zamek serializuje całość.
const syncLock = createWriteLock();

function isUnderPath(filePath: string, folder: string): boolean {
  const fp = filePath.toLowerCase();
  const fo = folder.toLowerCase();
  const rel = fp.slice(fo.length);
  return fp === fo || (fp.startsWith(fo) && (rel.startsWith(sep) || rel.startsWith('/')));
}

async function loadLibraryFolders(): Promise<string[]> {
  try {
    const store = await getStore();
    const raw = store.get('libraryFolders', []) as unknown;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const p = item.trim();
      if (p && !seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
      if (out.length >= 100) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function autoAddDownloadFolderEnabled(): Promise<boolean> {
  try {
    const store = await getStore();
    const download = store.get('download') as { autoAddDownloadFolder?: boolean } | undefined;
    return !!download?.autoAddDownloadFolder;
  } catch {
    return false;
  }
}

// Po zakończeniu pobierania ponownie skanuje folder docelowy, gdy należy on do
// biblioteki (zgodnie z decyzją: nigdy nie dodawaj folderów automatycznie, tylko
// odświeżaj istniejące). Scala nowe pliki z zapisanym skanem, zachowując statystyki
// odtwarzania plików, które były już znane.
export function syncDownloadToLibrary(
  outputPath: string,
  opts?: { forceAdd?: boolean }
): Promise<{ inLibrary: boolean; folder?: string; file?: MediaFile }> {
  return syncLock(() => syncDownloadToLibraryInner(outputPath, opts));
}

async function syncDownloadToLibraryInner(
  outputPath: string,
  opts?: { forceAdd?: boolean }
): Promise<{ inLibrary: boolean; folder?: string; file?: MediaFile }> {
  try {
    const targetDir = resolve(dirname(outputPath || ''));
    const folders = await loadLibraryFolders();
    let folder = folders.find((f) => isUnderPath(targetDir, resolve(f)));
    if (!folder && (opts?.forceAdd || (await autoAddDownloadFolderEnabled()))) {
      // Dodaje folder pobierania do biblioteki, aby plik był przeglądalny i
      // odtwarzalny od razu po zakończeniu pobierania (opt-in per zadanie lub globalnie).
      await addLibraryFolder(targetDir);
      folder = targetDir;
    }
    if (!folder) return { inLibrary: false };

    // Skanuje TYLKO folder, do którego trafiło pobranie (nierekurencyjnie). Ponowne
    // skanowanie całego drzewa (głębokość 8) + przepisywanie zapisanej biblioteki przy
    // każdym zakończonym pobraniu było największą amplifikacją zapisu (plan 1.3).
    const result = await scanDir(targetDir, 0);
    const data = await loadLibraryScanned();
    const existing = data && Array.isArray(data.files) ? data.files : [];
    const byPath = new Map(existing.map((f) => [f.path, f]));
    const folderTypes = { ...(data?.folderTypes || {}) };
    const folderType = folderTypes[folder] ?? classifyFolderType(result);
    const filesInDir = filterFilesForFolderType(result.files, folderType);
    const fresh = filesInDir.filter((f) => !byPath.has(f.path));
    if (fresh.length > 0) {
      const files = [...existing, ...fresh];
      if (files.length > MAX_SCANNED_FILES) files.length = MAX_SCANNED_FILES;
      folderTypes[folder] = folderType;
      setLibraryScanned({ files, folderTypes });
      logger.info('library', `post-download scan: +${fresh.length} files in ${folder}`);
      broadcastToAllWindows('library:updated', { folder, added: fresh.length });
    }
    const file = filesInDir.find((f) => resolve(f.path) === resolve(outputPath));
    return { inLibrary: true, folder, file };
  } catch (e) {
    logger.warn('library', 'post-download library sync failed', e);
    return { inLibrary: false };
  }
}
