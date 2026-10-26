import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import os from 'os';
import { logger } from '../../../shared/logger';
import { resolveBin } from '../../binaries';
import { safeUserDataPath } from '../../utils/profile-state';

// Wizualizacja fali: dekodujemy tylko pierwszy strumień audio do mono 8 kHz i
// liczymy peak per kubełek. Cache trzyma gotowe 2000 punktów, więc kolejne
// odtwarzanie tego samego pliku nie uruchamia FFmpeg.
const SAMPLE_RATE = 8000;
const WAVEFORM_POINTS = 2000;
const CACHE_VERSION = 1;
const MAX_DECODE_MS = 10 * 60 * 1000;

interface WaveformCacheFile {
  version: number;
  size: number;
  mtime: number;
  peaks: number[];
}

let cacheDir: string | null = null;
function getCacheDir(): string {
  if (!cacheDir) {
    const userData = safeUserDataPath();
    cacheDir = userData
      ? join(userData, 'waveform-cache')
      : join(os.tmpdir(), 'onda', 'waveform-cache');
  }
  return cacheDir;
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function cachePath(filePath: string): string {
  return join(getCacheDir(), `${sha1(filePath)}.json`);
}

export function downsamplePeaks(peaks: readonly number[], width: number): number[] {
  const target = Math.max(1, Math.floor(width));
  if (peaks.length <= target) return [...peaks];
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor((i * peaks.length) / target);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / target));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) max = Math.max(max, peaks[j]);
    out.push(max);
  }
  return out;
}

/** Akumulator peaków dla strumienia PCM (Int16LE, mono). */
export class PeakAccumulator {
  private peak = 0;
  private count = 0;
  private readonly peaks: number[] = [];

  constructor(
    private readonly samplesPerBucket: number,
    private readonly maxPoints = WAVEFORM_POINTS
  ) {
    this.samplesPerBucket = Math.max(1, Math.floor(samplesPerBucket));
  }

  push(samples: Int16Array): void {
    for (const sample of samples) {
      this.peak = Math.max(this.peak, Math.abs(sample) / 32768);
      this.count += 1;
      if (this.count >= this.samplesPerBucket) {
        this.peaks.push(this.peak);
        this.peak = 0;
        this.count = 0;
      }
    }
  }

  finish(): number[] {
    if (this.count > 0) this.peaks.push(this.peak);
    return downsamplePeaks(this.peaks, this.maxPoints);
  }
}

export function computePeaks(
  samples: Int16Array,
  samplesPerBucket: number,
  maxPoints = WAVEFORM_POINTS
): number[] {
  const accumulator = new PeakAccumulator(samplesPerBucket, maxPoints);
  accumulator.push(samples);
  return accumulator.finish();
}

async function readCache(filePath: string, size: number, mtime: number): Promise<number[] | null> {
  try {
    const raw = await readFile(cachePath(filePath), 'utf-8');
    const parsed = JSON.parse(raw) as WaveformCacheFile;
    if (
      parsed?.version === CACHE_VERSION &&
      parsed.size === size &&
      parsed.mtime === mtime &&
      Array.isArray(parsed.peaks)
    ) {
      return parsed.peaks;
    }
  } catch {
    // brak cache / uszkodzony JSON
  }
  return null;
}

async function writeCache(
  filePath: string,
  size: number,
  mtime: number,
  peaks: number[]
): Promise<void> {
  try {
    const target = cachePath(filePath);
    await mkdir(dirname(target), { recursive: true });
    const payload: WaveformCacheFile = {
      version: CACHE_VERSION,
      size,
      mtime,
      peaks
    };
    await writeFile(target, JSON.stringify(payload), 'utf-8');
  } catch (e) {
    logger.warn('media', `waveform cache write failed for ${filePath}`, e);
  }
}

function decodePeaks(
  ffmpeg: string,
  filePath: string,
  duration: number,
  signal: AbortSignal
): Promise<number[]> {
  const samplesPerBucket =
    duration > 0
      ? Math.max(1, Math.floor((SAMPLE_RATE * duration) / WAVEFORM_POINTS))
      : SAMPLE_RATE * 2; // bez duration: kubełki 2 s, potem i tak downsample

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Waveform decode aborted'));
      return;
    }
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        '-nostdin',
        '-i',
        filePath,
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        's16le',
        '-'
      ],
      { windowsHide: true }
    );

    const accumulator = new PeakAccumulator(samplesPerBucket);
    let carry: Buffer | null = null;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      fn();
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      settle(() => reject(new Error('Waveform decode timed out')));
    }, MAX_DECODE_MS);

    const onAbort = (): void => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      settle(() => reject(new Error('Waveform decode aborted')));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      const buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
      const even = buffer.length & ~1;
      if (even > 0) {
        const samples = new Int16Array(even / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(i * 2);
        accumulator.push(samples);
      }
      carry = even < buffer.length ? buffer.subarray(even) : null;
    });

    child.on('error', (err) => {
      settle(() => reject(err));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        settle(() => reject(new Error(`FFmpeg exited with ${code}`)));
        return;
      }
      settle(() => resolve(accumulator.finish()));
    });
  });
}

const inFlight = new Map<string, Promise<number[]>>();

/** Zwraca 2000 peaków (0..1) dla lokalnego pliku audio; [] gdy brak FFmpeg/duration. */
export async function getWaveform(
  filePath: string,
  durationSec = 0,
  signal?: AbortSignal
): Promise<number[]> {
  const existing = inFlight.get(filePath);
  if (existing) return existing;

  const promise = (async () => {
    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) return [];
    const cached = await readCache(filePath, s.size, Math.round(s.mtimeMs));
    if (cached) return cached;

    const ffmpeg = await resolveBin('ffmpeg');
    if (!ffmpeg) return [];

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const peaks = await decodePeaks(ffmpeg, filePath, durationSec, controller.signal);
      if (peaks.length > 0) await writeCache(filePath, s.size, Math.round(s.mtimeMs), peaks);
      return peaks;
    } catch (e) {
      if (!signal?.aborted) {
        logger.warn('media', `waveform decode failed for ${filePath}`, e);
      }
      return [];
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  })();

  inFlight.set(filePath, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(filePath);
  }
}
