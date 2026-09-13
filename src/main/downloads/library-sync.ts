import { dirname, resolve, sep } from 'path';
import type { MediaFile } from '../../renderer/src/types/media';
import { getStore } from '../ipc/cover-cache';
import { loadLibraryScanned, setLibraryScanned } from '../ipc/library-store';
import { scanDir, classifyFolderType, filterFilesForFolderType } from '../ipc/library-scan';
import { addLibraryFolder } from '../ipc/library-handlers';
import { logger } from '../../shared/logger';
import { broadcastToAllWindows } from '../utils/broadcast';

const MAX_SCANNED_FILES = 50000;

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

// After a download finishes, re-scans the target folder when it belongs to the
// library (per decision: never auto-add folders, only refresh existing ones).
// Merges new files into the persisted scan, preserving play stats of files
// that were already known.
export async function syncDownloadToLibrary(
  outputPath: string,
  opts?: { forceAdd?: boolean }
): Promise<{ inLibrary: boolean; folder?: string; file?: MediaFile }> {
  try {
    const targetDir = resolve(dirname(outputPath || ''));
    const folders = await loadLibraryFolders();
    let folder = folders.find((f) => isUnderPath(targetDir, resolve(f)));
    if (!folder && (opts?.forceAdd || (await autoAddDownloadFolderEnabled()))) {
      // Add the download folder to the library so the file is browsable and
      // playable right after the download finishes (opt-in per job or globally).
      await addLibraryFolder(targetDir);
      folder = targetDir;
    }
    if (!folder) return { inLibrary: false };

    // Scan ONLY the folder the download landed in (non-recursive). Rescanning
    // the whole tree (depth 8) + rewriting the persisted library on every
    // finished download was the biggest write amplification (plan 1.3).
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
