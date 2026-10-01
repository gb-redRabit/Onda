import { extname } from 'path';
import type { MediaFile } from '../../../shared/types/media';
import { VIDEO_EXTS } from '../../../shared/constants';

// Czyste filtry typu folderu / plików wyodrębnione z `library-scan.ts` (plan 2.8).
// `library-scan` re-eksportuje publiczne z nich, aby istniejące importery/testy działały
// bez zmian.

const VIDEO_EXT_SET = new Set(VIDEO_EXTS);

export const FOLDER_TYPE_RATIO = 0.5;

export function classifyFolderType(counts: {
  audioCount: number;
  videoCount: number;
  imageCount: number;
}): 'audio' | 'video' | 'image' | 'mixed' {
  const mediaTotal = counts.audioCount + counts.videoCount;
  if (counts.imageCount > 0 && mediaTotal === 0) return 'image';
  if (counts.audioCount > 0 && counts.videoCount === 0) return 'audio';
  if (counts.videoCount > 0 && counts.audioCount === 0) return 'video';
  if (mediaTotal > 0 && counts.audioCount / mediaTotal >= FOLDER_TYPE_RATIO) return 'audio';
  if (mediaTotal > 0 && counts.videoCount / mediaTotal >= FOLDER_TYPE_RATIO) return 'video';
  return 'mixed';
}

// Foldery audio dodają do biblioteki TYLKO pliki audio — okładki (obrazy) i
// wideo znajdujące się w folderze audio są pomijane podczas skanowania. Pozostałe
// typy folderów zachowują wszystkie pliki mediów.
export function filterFilesForFolderType(
  files: MediaFile[],
  folderType: 'audio' | 'video' | 'image' | 'mixed'
): MediaFile[] {
  if (folderType === 'audio') return files.filter((f) => f.type === 'audio');
  return files;
}

// Plik wideo będący animowaną okładką audio z tego samego katalogu
// (np. "Swørn - Butterfly.mp3" ↔ "Swørn - Butterfly.mp4" albo wariant odwrotny
// "…_rev.mp4" używany przez niektóre okładki ffmpeg) nigdy nie może trafić do biblioteki
// jako osobny utwór wideo — utwór audio już istnieje, a MediaCover
// serwuje wideo jako jego okładkę.
export function filterCoverSiblingVideos(files: MediaFile[]): MediaFile[] {
  const audioStemSet = new Set<string>();
  for (const f of files) {
    if (f.type === 'audio') {
      const ext = extname(f.name).toLowerCase();
      // Stem bez rozróżniania wielkości liter: usuń rozszerzenie po długości, a nie przez
      // path.basename(name, ext), które porównuje rozszerzenie z rozróżnianiem wielkości liter.
      audioStemSet.add(f.name.slice(0, f.name.length - ext.length).toLowerCase());
    }
  }
  return files.filter((f) => !isCoverVideo(f, audioStemSet));
}

function isCoverVideo(file: MediaFile, audioStemSet: Set<string>): boolean {
  if (file.type !== 'video') return false;
  const ext = extname(file.name).toLowerCase();
  if (!VIDEO_EXT_SET.has(ext)) return false;
  const stem = file.name.slice(0, file.name.length - ext.length).toLowerCase();
  if (audioStemSet.has(stem)) return true;
  return stem.endsWith('_rev') && audioStemSet.has(stem.slice(0, -4));
}
