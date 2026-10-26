import { logger } from '../../../shared/logger';
import { runCommandResult } from '../../utils/exec';

// ReplayGain 2.0 używa -18 LUFS jako celu; EBU R128 używa -23 LUFS. Trzymamy się
// ReplayGain, bo tym samym trybem posługują się tagi (`replaygain_*_gain`).
export const REPLAYGAIN_TARGET_LUFS = -18;

// Zapas na true peak: nie podbijamy głośności powyżej -1 dBFS.
const TRUE_PEAK_CEILING_DB = -1;

const MIN_GAIN_DB = -24;
const MAX_GAIN_DB = 24;

export interface LoudnessMeasurement {
  /** Integrated loudness w LUFS. */
  lufs: number;
  /** True peak w dBFS, jeśli ffmpeg go podał. */
  peakDb?: number;
}

export interface LoudnessSample {
  lufs: number;
  /** Czas trwania w sekundach — waga przy łączeniu albumu. */
  duration: number;
}

/**
 * Parsuje podsumowanie filtra `ebur128` z ffmpeg. Interesują nas dwie linie:
 * `I: -23.0 LUFS` oraz `Peak: -1.0 dBFS`. Bierzemy ostatnie dopasowanie, bo ffmpeg
 * potrafi wypisać podsumowanie więcej niż raz przy złożonych wejściach.
 */
export function parseEbur128(stderr: string): LoudnessMeasurement | null {
  const lufsMatches = [...stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  const lufsMatch = lufsMatches[lufsMatches.length - 1];
  if (!lufsMatch) return null;
  const lufs = Number(lufsMatch[1]);
  if (!Number.isFinite(lufs)) return null;

  const peakMatches = [...stderr.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)];
  const peakMatch = peakMatches[peakMatches.length - 1];
  const peakDb = peakMatch ? Number(peakMatch[1]) : undefined;

  return {
    lufs,
    peakDb: typeof peakDb === 'number' && Number.isFinite(peakDb) ? peakDb : undefined
  };
}

/** Gain w dB: różnica do celu, przycięta tak, by nie przekroczyć -1 dBFS. */
export function loudnessToGainDb(
  lufs: number,
  peakDb?: number,
  targetLufs = REPLAYGAIN_TARGET_LUFS
): number {
  const raw = targetLufs - lufs;
  const peakLimited =
    typeof peakDb === 'number' && Number.isFinite(peakDb)
      ? Math.min(raw, TRUE_PEAK_CEILING_DB - peakDb)
      : raw;
  return Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, peakLimited));
}

export function gainDbToRatio(gainDb: number): number {
  return Math.pow(10, gainDb / 20);
}

/**
 * Przybliżona głośność albumu: średnia energii ważona czasem trwania.
 * Dokładny pomiar EBU R128 wymagałby gatingu na całym programie albumu; to
 * przybliżenie jest wystarczające dla albumowego ReplayGain i pozwala uniknąć
 * ponownego dekodowania wszystkich plików albumu.
 */
export function combineAlbumLufs(samples: readonly LoudnessSample[]): number | null {
  let energy = 0;
  let total = 0;
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.lufs) ||
      !Number.isFinite(sample.duration) ||
      sample.duration <= 0
    ) {
      continue;
    }
    energy += Math.pow(10, sample.lufs / 10) * sample.duration;
    total += sample.duration;
  }
  if (total <= 0 || energy <= 0) return null;
  return 10 * Math.log10(energy / total);
}

/** Mierzy jeden plik przez ffmpeg (dekoduje całość — wolne, ale dokładne). */
export async function analyzeFileLoudness(
  ffmpegPath: string,
  filePath: string,
  signal?: AbortSignal
): Promise<LoudnessMeasurement | null> {
  try {
    const { stderr } = await runCommandResult(
      ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-i',
        filePath,
        '-filter_complex',
        'ebur128=peak=true',
        '-f',
        'null',
        '-'
      ],
      { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024, signal }
    );
    return parseEbur128(stderr);
  } catch (e) {
    if (signal?.aborted) return null;
    logger.warn('library', `loudness analysis failed for ${filePath}`, e);
    return null;
  }
}
