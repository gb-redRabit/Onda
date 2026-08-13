import { dirname, resolve, sep } from 'path';
import type { MediaFile } from '../../renderer/src/types/media';
import { getStore } from '../ipc/cover-cache';
import { scanDir } from '../ipc/library-scan';
import { addLibraryFolder } from '../ipc/library-handlers';
import { logger } from '../../shared/logger';
import { broadcastToAllWindows } from '../utils/broadcast';

const MAX_SCANNED_FILES = 50000;

interface LibraryScannedData {
  files: MediaFile[];
  folderTypes: Record<string, 'audio' | 'video' | 'image' | 'mixed'>;
}

function isUnderPath(filePath: string, folder: string): boolean {
  const rel = filePath.slice(folder.length);
  return (
    filePath === folder ||
    (filePath.startsWith(folder) && (rel.startsWith(sep) || rel.startsWith('/')))
  );
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

function folderTypeFor(result: {
  audioCount: number;
  videoCount: number;
  imageCount: number;
}): 'audio' | 'video' | 'image' | 'mixed' {
  const mediaTotal = result.audioCount + result.videoCount;
  if (result.imageCount > 0 && mediaTotal === 0) return 'image';
  if (result.audioCount > 0 && result.videoCount === 0) return 'audio';
  if (result.videoCount > 0 && result.audioCount === 0) return 'video';
  if (mediaTotal > 0 && result.audioCount / mediaTotal >= 0.7) return 'audio';
  if (mediaTotal > 0 && result.videoCount / mediaTotal >= 0.7) return 'video';
  return 'mixed';
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

    const result = await scanDir(folder, 8);
    const store = await getStore();
    const data = store.get('libraryScanned', null) as LibraryScannedData | null;
    const existing = data && Array.isArray(data.files) ? data.files : [];
    const byPath = new Map(existing.map((f) => [f.path, f]));
    const fresh = result.files.filter((f) => !byPath.has(f.path));
    const files = [...existing, ...fresh];
    if (files.length > MAX_SCANNED_FILES) files.length = MAX_SCANNED_FILES;
    const folderTypes = { ...(data?.folderTypes || {}) };
    folderTypes[folder] = folderTypeFor(result);
    store.set('libraryScanned', structuredClone({ files, folderTypes }));
    logger.info('library', `post-download scan: +${fresh.length} files in ${folder}`);
    broadcastToAllWindows('library:updated', { folder, added: fresh.length });
    const file = result.files.find((f) => resolve(f.path) === resolve(outputPath));
    return { inLibrary: true, folder, file };
  } catch (e) {
    logger.warn('library', 'post-download library sync failed', e);
    return { inLibrary: false };
  }
}
