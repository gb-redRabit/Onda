import { mkdir, stat, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import os from 'os';
import { errMsg } from '../../shared/helpers';
import { logger } from '../../shared/logger';
import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';

const tempDir = join(os.tmpdir(), 'onda', 'audio-transcodes');

export async function transcodeAudioChunk(
  filePath: string,
  startTime: number,
  duration: number
): Promise<string | null> {
  if (!Number.isFinite(startTime) || !Number.isFinite(duration) || startTime < 0 || duration <= 0) {
    return null;
  }
  await mkdir(tempDir, { recursive: true });
  const hash = createHash('md5').update(filePath).digest('hex');
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
  const hash = createHash('md5').update(filePath).digest('hex');
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
  } catch (e) {
    logger.warn('media', 'transcode cleanup failed', e);
  }
}
