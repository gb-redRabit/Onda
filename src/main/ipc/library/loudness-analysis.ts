import type { MediaFile } from '../../../shared/types/media';
import { resolveBin } from '../../binaries';
import { mapLimit } from '../../utils/map-limit';
import {
  analyzeFileLoudness,
  combineAlbumLufs,
  gainDbToRatio,
  loudnessToGainDb,
  REPLAYGAIN_TARGET_LUFS,
  type LoudnessMeasurement,
  type LoudnessSample
} from './loudness';

// ffmpeg dekoduje cały plik, więc 4 równoległe procesy to kompromis między czasem
// a obciążeniem CPU/dysku na typowym laptopie.
const ANALYSIS_CONCURRENCY = 4;

// Zabezpieczenie przed jednym kliknięciem analizującym 50 tys. plików przez godziny.
const MAX_ANALYZED_FILES = 20000;

export interface LoudnessProgress {
  current: number;
  total: number;
  path?: string;
}

export interface LoudnessUpdate {
  path: string;
  /** Liniowy współczynnik (jak tagi ReplayGain). */
  trackGain?: number;
  albumGain?: number;
}

export interface LoudnessAnalysisSummary {
  analyzed: number;
  albums: number;
  failed: number;
  aborted: boolean;
  truncated: boolean;
}

function isValidRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function albumKey(file: MediaFile): string | null {
  const album = file.metadata?.album?.trim();
  if (!album) return null;
  const artist = (file.metadata?.albumArtist || file.metadata?.artist || '').trim();
  return `${artist.toLowerCase()}\u0000${album.toLowerCase()}`;
}

// Głośność wynikająca z istniejącego gainu. Zakładamy cel -18 LUFS (ReplayGain 2.0);
// dla tagów z innym celem to przybliżenie, ale wystarczające do proporcji albumu.
function lufsFromGainRatio(ratio: number): number {
  return REPLAYGAIN_TARGET_LUFS - 20 * Math.log10(ratio);
}

/**
 * Analizuje pliki bez tagów ReplayGain i buduje aktualizacje metadanych.
 * Nie zapisuje niczego — wywołujący scala wynik z biblioteką.
 */
export async function analyzeLibraryLoudness(
  files: readonly MediaFile[],
  signal: AbortSignal,
  onProgress?: (progress: LoudnessProgress) => void
): Promise<{ updates: LoudnessUpdate[]; summary: LoudnessAnalysisSummary }> {
  const audio = files.filter((f) => f.type === 'audio' && !!f.path);
  // Mierzymy tylko pliki bez track gainu. Pliki z tagiem track mają znaną głośność
  // (cel − track gain), więc wystarczą do policzenia albumu bez ponownego dekodowania.
  const candidates = audio.filter((f) => !isValidRatio(f.metadata?.replayGainTrackGain));
  const truncated = candidates.length > MAX_ANALYZED_FILES;
  const queue = candidates.slice(0, MAX_ANALYZED_FILES);

  const ffmpeg = queue.length > 0 ? await resolveBin('ffmpeg') : null;
  if (queue.length > 0 && !ffmpeg) throw new Error('FFmpeg is not available');

  const measured = new Map<string, LoudnessMeasurement>();
  let done = 0;
  let failed = 0;
  onProgress?.({ current: 0, total: queue.length });

  if (ffmpeg) {
    await mapLimit(queue, ANALYSIS_CONCURRENCY, async (file) => {
      if (signal.aborted) return;
      const measurement = await analyzeFileLoudness(ffmpeg, file.path, signal);
      if (measurement) measured.set(file.path, measurement);
      else if (!signal.aborted) failed++;
      done++;
      onProgress?.({ current: done, total: queue.length, path: file.path });
    });
  }

  const updates = new Map<string, LoudnessUpdate>();
  for (const [path, measurement] of measured) {
    updates.set(path, {
      path,
      trackGain: gainDbToRatio(loudnessToGainDb(measurement.lufs, measurement.peakDb))
    });
  }

  // Album gain: potrzebna głośność każdego utworu albumu. Zmierzona > z tagu track.
  // Jeśli któregokolwiek brakuje, album zostaje pominięty (lepiej brak wyniku niż
  // gain policzony z niekompletnego zestawu).
  const albums = new Map<string, MediaFile[]>();
  for (const file of audio) {
    const key = albumKey(file);
    if (!key) continue;
    const group = albums.get(key);
    if (group) group.push(file);
    else albums.set(key, [file]);
  }

  let albumsUpdated = 0;
  for (const group of albums.values()) {
    if (group.every((f) => isValidRatio(f.metadata?.replayGainAlbumGain))) continue;

    // Album gain jest właściwością albumu: jeśli choć jeden utwór już go ma,
    // propagujemy tę wartość zamiast liczyć album od nowa.
    const existingAlbumGain = group
      .map((f) => f.metadata?.replayGainAlbumGain)
      .find((value): value is number => isValidRatio(value));
    if (existingAlbumGain !== undefined) {
      let applied = false;
      for (const file of group) {
        if (isValidRatio(file.metadata?.replayGainAlbumGain)) continue;
        const existing = updates.get(file.path) ?? { path: file.path };
        updates.set(file.path, { ...existing, albumGain: existingAlbumGain });
        applied = true;
      }
      if (applied) albumsUpdated++;
      continue;
    }

    const samples: LoudnessSample[] = [];
    let complete = true;
    for (const file of group) {
      const measuredLufs = measured.get(file.path)?.lufs;
      const trackRatio = file.metadata?.replayGainTrackGain;
      const lufs =
        typeof measuredLufs === 'number'
          ? measuredLufs
          : isValidRatio(trackRatio)
            ? lufsFromGainRatio(trackRatio)
            : undefined;
      const duration = typeof file.duration === 'number' ? file.duration : 0;
      if (lufs === undefined || duration <= 0) {
        complete = false;
        break;
      }
      samples.push({ lufs, duration });
    }
    if (!complete) continue;

    const albumLufs = combineAlbumLufs(samples);
    if (albumLufs === null) continue;
    const albumGain = gainDbToRatio(loudnessToGainDb(albumLufs));

    let applied = false;
    for (const file of group) {
      if (isValidRatio(file.metadata?.replayGainAlbumGain)) continue;
      const existing = updates.get(file.path) ?? { path: file.path };
      updates.set(file.path, { ...existing, albumGain });
      applied = true;
    }
    if (applied) albumsUpdated++;
  }

  return {
    updates: [...updates.values()],
    summary: {
      analyzed: measured.size,
      albums: albumsUpdated,
      failed,
      aborted: signal.aborted,
      truncated
    }
  };
}
