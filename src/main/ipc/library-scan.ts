import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { parseFile } from 'music-metadata';
import type { MediaFile } from '../../renderer/src/types/media';
import { VIDEO_EXTS, AUDIO_EXTS, IMAGE_EXTS } from '../../shared/constants';
import { MIME_TYPES } from '../../shared/mime';
import { logger } from '../../shared/logger';
import { getDuration } from './media-handlers';

const AUDIO_EXT_SET = new Set(AUDIO_EXTS);
const VIDEO_EXT_SET = new Set(VIDEO_EXTS);
const IMAGE_EXT_SET = new Set(IMAGE_EXTS);

const SUBDIR_CONCURRENCY = 16;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getAudioMetadata(
  filePath: string,
  ext: string
): Promise<{
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  track?: { no: number; of?: number };
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  format: string;
  isVideo: boolean;
  size: number;
} | null> {
  try {
    const s = await stat(filePath).catch(() => null);
    if (!s) return null;
    const meta = await parseFile(filePath, { duration: true });
    const formatInfo = meta.format;
    return {
      title: meta.common.title || basename(filePath, ext),
      artist: meta.common.artist || '',
      album: meta.common.album || '',
      year: meta.common.year,
      genre: meta.common.genre?.[0],
      track:
        meta.common.track && meta.common.track.no !== null && meta.common.track.no !== undefined
          ? { no: meta.common.track.no, of: meta.common.track.of ?? undefined }
          : undefined,
      duration: formatInfo?.duration || 0,
      bitrate: formatInfo?.bitrate || 0,
      sampleRate: formatInfo?.sampleRate || 0,
      channels: formatInfo?.numberOfChannels || 0,
      format: ext.slice(1),
      isVideo: false,
      size: s.size
    };
  } catch (e) {
    logger.warn('library', `getAudioMetadata failed for ${filePath}`, e);
    return null;
  }
}

async function getMetadata(
  filePath: string,
  ext: string
): Promise<{
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  track?: { no: number; of?: number };
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  format: string;
  isVideo: boolean;
  size: number;
} | null> {
  try {
    const s = await stat(filePath).catch(() => null);
    if (!s) return null;

    const isVideo = VIDEO_EXTS.includes(ext);

    if (!isVideo) {
      return getAudioMetadata(filePath, ext);
    }

    return {
      title: basename(filePath, ext),
      artist: '',
      album: '',
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      format: ext.slice(1),
      isVideo: true,
      size: s.size
    };
  } catch (e) {
    logger.warn('library', `getMetadata failed for ${filePath}`, e);
    return null;
  }
}

async function processAudioFile(
  fullPath: string,
  entryName: string,
  ext: string
): Promise<{ file: MediaFile | null }> {
  const s = await stat(fullPath).catch(() => null);
  if (!s) return { file: null };
  const meta = await getMetadata(fullPath, ext);
  return {
    file: {
      id: fullPath,
      name: entryName,
      path: fullPath,
      extension: ext,
      mimeType: '',
      size: s.size,
      type: 'audio',
      metadata: meta
        ? {
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            year: meta.year,
            genre: meta.genre,
            track: meta.track
          }
        : undefined,
      duration: meta?.duration || 0,
      addedAt: s.birthtimeMs ?? Date.now(),
      playCount: 0
    }
  };
}

async function processVideoFile(
  fullPath: string,
  entryName: string,
  ext: string
): Promise<{ file: MediaFile | null }> {
  const s = await stat(fullPath).catch(() => null);
  if (!s) return { file: null };
  const duration = await getDuration(fullPath);
  return {
    file: {
      id: fullPath,
      name: entryName,
      path: fullPath,
      extension: ext,
      mimeType: '',
      size: s.size,
      type: 'video',
      duration,
      addedAt: s.birthtimeMs ?? Date.now(),
      playCount: 0
    }
  };
}

async function processImageFile(
  fullPath: string,
  entryName: string,
  ext: string
): Promise<{ file: MediaFile | null }> {
  const s = await stat(fullPath).catch(() => null);
  if (!s) return { file: null };
  return {
    file: {
      id: fullPath,
      name: entryName,
      path: fullPath,
      extension: ext,
      mimeType: MIME_TYPES[ext] || '',
      size: s.size,
      type: 'image',
      addedAt: s.birthtimeMs ?? Date.now(),
      playCount: 0
    }
  };
}

export async function scanDir(
  dirPath: string,
  maxDepth = 10,
  depth = 0
): Promise<{ files: MediaFile[]; audioCount: number; videoCount: number; imageCount: number }> {
  if (depth > maxDepth) return { files: [], audioCount: 0, videoCount: 0, imageCount: 0 };

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const subDirTasks: Array<() => Promise<{
      files: MediaFile[];
      audioCount: number;
      videoCount: number;
      imageCount: number;
    }>> = [];
    const audioTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
    const videoTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
    const imageTasks: Array<() => Promise<{ file: MediaFile | null }>> = [];
    let audioCount = 0;
    let videoCount = 0;
    let imageCount = 0;

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        subDirTasks.push(() => scanDir(fullPath, maxDepth, depth + 1));
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (AUDIO_EXT_SET.has(ext)) {
          audioCount++;
          audioTasks.push(() => processAudioFile(fullPath, entry.name, ext));
        } else if (VIDEO_EXT_SET.has(ext)) {
          videoCount++;
          videoTasks.push(() => processVideoFile(fullPath, entry.name, ext));
        } else if (IMAGE_EXT_SET.has(ext)) {
          imageCount++;
          imageTasks.push(() => processImageFile(fullPath, entry.name, ext));
        }
      }
    }

    const chunkSize = 50;
    const fileResults: Array<{ file: MediaFile | null }> = [];
    let ai = 0;
    let vi = 0;
    let ii = 0;
    while (ai < audioTasks.length || vi < videoTasks.length || ii < imageTasks.length) {
      const chunk: Array<() => Promise<{ file: MediaFile | null }>> = [];
      while (
        chunk.length < chunkSize &&
        (ai < audioTasks.length || vi < videoTasks.length || ii < imageTasks.length)
      ) {
        if (ai < audioTasks.length && (vi >= videoTasks.length || chunk.length % 3 === 0)) {
          chunk.push(audioTasks[ai++]);
        } else if (ii < imageTasks.length && (vi >= videoTasks.length || chunk.length % 3 === 1)) {
          chunk.push(imageTasks[ii++]);
        } else if (vi < videoTasks.length) {
          chunk.push(videoTasks[vi++]);
        } else if (ai < audioTasks.length) {
          chunk.push(audioTasks[ai++]);
        } else if (ii < imageTasks.length) {
          chunk.push(imageTasks[ii++]);
        }
      }
      const results = await Promise.all(chunk.map((fn) => fn()));
      fileResults.push(...results);
    }

    const subResults = await mapLimit(subDirTasks, SUBDIR_CONCURRENCY, (fn) => fn());

    const files: MediaFile[] = [];
    let totalAudio = 0;
    let totalVideo = 0;
    let totalImage = 0;

    for (const r of subResults) {
      files.push(...r.files);
      totalAudio += r.audioCount;
      totalVideo += r.videoCount;
      totalImage += r.imageCount;
    }

    for (const r of fileResults) {
      if (r.file) files.push(r.file);
    }
    totalAudio += audioCount;
    totalVideo += videoCount;
    totalImage += imageCount;

    return { files, audioCount: totalAudio, videoCount: totalVideo, imageCount: totalImage };
  } catch (err) {
    logger.warn('library', `scanDir error reading ${dirPath}: ${err}`);
    return { files: [], audioCount: 0, videoCount: 0, imageCount: 0 };
  }
}
