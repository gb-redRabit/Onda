import { extname } from 'path';
import type { MediaFile } from '../../renderer/src/types/media';
import { VIDEO_EXTS } from '../../shared/constants';

// Pure folder-type / file filters extracted from `library-scan.ts` (plan 2.8).
// `library-scan` re-exports the public ones so existing importers/tests keep
// working unchanged.

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

// Audio folders add ONLY audio files to the library — covers (images) and
// videos living inside an audio folder are skipped during the scan. Other
// folder types keep all media files.
export function filterFilesForFolderType(
  files: MediaFile[],
  folderType: 'audio' | 'video' | 'image' | 'mixed'
): MediaFile[] {
  if (folderType === 'audio') return files.filter((f) => f.type === 'audio');
  return files;
}

// A video file that is the animated cover for a same-directory audio file
// (e.g. "Swørn - Butterfly.mp3" ↔ "Swørn - Butterfly.mp4", or the "…_rev.mp4"
// reverse variant used by some ffmpeg covers) must never land in the library
// as a separate video track — the audio track already exists, and MediaCover
// serves the video as its cover.
export function filterCoverSiblingVideos(files: MediaFile[]): MediaFile[] {
  const audioStemSet = new Set<string>();
  for (const f of files) {
    if (f.type === 'audio') {
      const ext = extname(f.name).toLowerCase();
      // Case-insensitive stem: strip the extension by length, not by
      // path.basename(name, ext) which compares extension case-sensitively.
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
