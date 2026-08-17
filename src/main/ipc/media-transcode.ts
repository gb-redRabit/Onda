import { mkdir, stat, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import os from 'os';
import { errMsg } from '../../shared/helpers';
import { logger } from '../../shared/logger';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';

const tempDir = join(os.tmpdir(), 'onda', 'audio-transcodes');
const videoTempDir = join(os.tmpdir(), 'onda', 'video-transcodes');

// Include size + mtime so a replaced file never reuses a stale transcode.
async function sourceStamp(filePath: string): Promise<string> {
  try {
    const s = await stat(filePath);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return '';
  }
}

export async function transcodeAudioChunk(
  filePath: string,
  startTime: number,
  duration: number
): Promise<string | null> {
  if (!Number.isFinite(startTime) || !Number.isFinite(duration) || startTime < 0 || duration <= 0) {
    return null;
  }
  await mkdir(tempDir, { recursive: true });
  const stamp = await sourceStamp(filePath);
  const hash = createHash('md5')
    .update(filePath + stamp)
    .digest('hex');
  const chunkKey = `${hash}_${Math.floor(startTime)}_${Math.ceil(duration)}`;
  const outPath = join(tempDir, `${chunkKey}.m4a`);

  try {
    await stat(outPath);
    return outPath;
  } catch {
    // transcoded chunk does not exist yet — expected control flow
  }

  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await runCommand(
      ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        String(startTime),
        '-i',
        filePath,
        '-map',
        '0:a:0',
        '-t',
        String(duration),
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        outPath,
        '-y'
      ],
      { timeout: 120000 }
    );
    return outPath;
  } catch (err) {
    logger.error('transcode', 'audio chunk failed', errMsg(err));
    return null;
  }
}

export async function transcodeAudio(filePath: string): Promise<string | null> {
  await mkdir(tempDir, { recursive: true });
  const stamp = await sourceStamp(filePath);
  const hash = createHash('md5')
    .update(filePath + stamp)
    .digest('hex');
  const outPath = join(tempDir, `${hash}.m4a`);

  try {
    await stat(outPath);
    return outPath;
  } catch {
    // transcoded file does not exist yet — expected control flow
  }

  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await runCommand(
      ffmpeg,
      [
        '-v',
        'error',
        '-i',
        filePath,
        '-map',
        '0:a:0',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        outPath,
        '-y'
      ],
      { timeout: 600000 }
    );
    return outPath;
  } catch (err) {
    logger.error('transcode', 'audio transcode failed', errMsg(err));
    return null;
  }
}

export async function transcodeVideo(filePath: string): Promise<string | null> {
  await mkdir(videoTempDir, { recursive: true });
  const stamp = await sourceStamp(filePath);
  const hash = createHash('md5')
    .update(filePath + stamp)
    .digest('hex');
  const outPath = join(videoTempDir, `${hash}.mp4`);

  try {
    await stat(outPath);
    return outPath;
  } catch {
    // transcoded file does not exist yet — expected control flow
  }

  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    await runCommand(
      ffmpeg,
      [
        '-v',
        'error',
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        outPath,
        '-y'
      ],
      { timeout: 30 * 60 * 1000 }
    );
    return outPath;
  } catch (err) {
    logger.error('transcode', 'video transcode failed', errMsg(err));
    return null;
  }
}

export async function cleanupOldTranscodes(): Promise<void> {
  try {
    await mkdir(tempDir, { recursive: true });
    const entries = await readdir(tempDir);
    const now = Date.now();
    for (const entry of entries) {
      try {
        const fullPath = join(tempDir, entry);
        const s = await stat(fullPath);
        if (now - s.mtimeMs > 24 * 60 * 60 * 1000) {
          await rm(fullPath, { force: true });
        }
      } catch (e) {
        logger.warn('media', `transcode cleanup failed for ${entry}`, e);
      }
    }
    await mkdir(videoTempDir, { recursive: true });
    const vids = await readdir(videoTempDir);
    for (const entry of vids) {
      try {
        const fullPath = join(videoTempDir, entry);
        const s = await stat(fullPath);
        if (now - s.mtimeMs > 24 * 60 * 60 * 1000) {
          await rm(fullPath, { force: true });
        }
      } catch (e) {
        logger.warn('media', `video transcode cleanup failed for ${entry}`, e);
      }
    }
  } catch (e) {
    logger.warn('media', 'transcode cleanup failed', e);
  }
}
