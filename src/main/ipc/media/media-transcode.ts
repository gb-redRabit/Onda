import { mkdir, stat, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import os from 'os';
import { errMsg } from '../../../shared/helpers';
import { logger } from '../../../shared/logger';
import { runCommand } from '../../utils/exec';
import { resolveBin } from '../../binaries';
import { detectH264Encoder } from '../../tools/media-convert';
import { sourceStamp } from '../../utils/source-stamp';

const tempDir = join(os.tmpdir(), 'onda', 'audio-transcodes');
const videoTempDir = join(os.tmpdir(), 'onda', 'video-transcodes');

// Stempel size+mtime jest współdzielony z cache miniatur (`utils/source-stamp`);
// zastąpiony plik nigdy nie użyje nieaktualnego transkodowania.

// Dwa równoległe żądania tego samego transkodowania odpalały dwa procesy ffmpeg
// piszące do jednego `outPath` (`-y`), więc wynik bywał uszkodzony.
const transcodeInFlight = new Map<string, Promise<string | null>>();

function dedupeTranscode(key: string, run: () => Promise<string | null>): Promise<string | null> {
  const existing = transcodeInFlight.get(key);
  if (existing) return existing;
  const job = run();
  transcodeInFlight.set(key, job);
  void job.finally(() => transcodeInFlight.delete(key));
  return job;
}

export function transcodeAudioChunk(
  filePath: string,
  startTime: number,
  duration: number
): Promise<string | null> {
  return dedupeTranscode(`${filePath}\0${startTime}\0${duration}`, () =>
    doTranscodeAudioChunk(filePath, startTime, duration)
  );
}

async function doTranscodeAudioChunk(
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
    // transkodowany chunk jeszcze nie istnieje — oczekiwany przebieg sterowania
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

export function transcodeAudio(filePath: string): Promise<string | null> {
  return dedupeTranscode(`audio:${filePath}`, () => doTranscodeAudio(filePath));
}

async function doTranscodeAudio(filePath: string): Promise<string | null> {
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
    // transkodowany plik jeszcze nie istnieje — oczekiwany przebieg sterowania
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

export interface VideoTranscodeProgress {
  percent: number;
  timeSec: number;
  speed?: string;
}

export interface VideoTranscodeOptions {
  durationSec?: number;
  onProgress?: (progress: VideoTranscodeProgress) => void;
}

export function transcodeVideo(
  filePath: string,
  options: VideoTranscodeOptions = {}
): Promise<string | null> {
  return dedupeTranscode(`video:${filePath}`, () => doTranscodeVideo(filePath, options));
}

/** Rozbija strumień `-progress` na pary klucz=wartość, zachowując niepełny ogon. */
function parseProgressLines(buffer: string, onEntry: (key: string, value: string) => void): string {
  const lines = buffer.split(/\r?\n/);
  // `split` zawsze zwraca co najmniej jeden element — ostatni to niepełna linia.
  const rest = lines.pop() as string;
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) onEntry(line.slice(0, eq), line.slice(eq + 1));
  }
  return rest;
}

function parseFfmpegTime(value: string): number {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function doTranscodeVideo(
  filePath: string,
  options: VideoTranscodeOptions = {}
): Promise<string | null> {
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
    // transkodowany plik jeszcze nie istnieje — oczekiwany przebieg sterowania
  }

  try {
    const ffmpeg = (await resolveBin('ffmpeg')) || 'ffmpeg';
    // Zarządzane buildy Windows/Linux są LGPL i nie zawierają libx264. Bez fallbacku
    // każde „nieobsługiwane przez Chromium” wideo (DivX/Xvid, WMV, HEVC) kończyło się
    // błędem `Unknown encoder 'libx264'` i komunikatem o nieobsługiwanym pliku.
    const encoder = await detectH264Encoder();
    const videoArgs =
      encoder === 'libx264'
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
        : encoder === 'mpeg4'
          ? ['-c:v', 'mpeg4', '-q:v', '4']
          : ['-c:v', encoder, '-b:v', '2M'];
    const progress = options.onProgress;
    let progressBuffer = '';
    let lastTimeSec = 0;
    let lastPercent = -1;
    const progressHandler = progress
      ? (chunk: string): void => {
          const emit = (timeSec: number): void => {
            lastTimeSec = timeSec;
            lastPercent =
              options.durationSec && options.durationSec > 0
                ? Math.min(100, Math.max(0, (timeSec / options.durationSec) * 100))
                : -1;
            progress({ percent: lastPercent, timeSec });
          };
          progressBuffer += chunk;
          progressBuffer = parseProgressLines(progressBuffer, (key, raw) => {
            if (key === 'out_time_us' || key === 'out_time_ms') {
              const micros = Number(raw);
              if (Number.isFinite(micros)) emit(micros / 1_000_000);
            } else if (key === 'out_time') {
              emit(parseFfmpegTime(raw));
            } else if (key === 'speed') {
              progress({ percent: lastPercent, timeSec: lastTimeSec, speed: raw.trim() });
            }
          });
        }
      : undefined;
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
        ...videoArgs,
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        ...(progress ? ['-progress', 'pipe:1', '-nostats'] : []),
        outPath,
        '-y'
      ],
      {
        timeout: 30 * 60 * 1000,
        ...(progressHandler ? { onStdout: progressHandler } : {})
      }
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
