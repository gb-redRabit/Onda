import type { MediaFile } from '@renderer/types/media';
import type { ScrobbleTrack } from '@shared/types/ipc/channels-scrobbling';

/** Last.fm/ListenBrainz nie przyjmują utworów krótszych niż 30 s. */
export const SCROBBLE_MIN_DURATION_SEC = 30;
/** Reguła Last.fm: 50% utworu albo 4 minuty — co nastąpi wcześniej. */
export const SCROBBLE_MAX_ELAPSED_SEC = 240;

export function scrobbleThreshold(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec < SCROBBLE_MIN_DURATION_SEC) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(durationSec / 2, SCROBBLE_MAX_ELAPSED_SEC);
}

export function shouldScrobble(elapsedSec: number, durationSec: number): boolean {
  const threshold = scrobbleThreshold(durationSec);
  return Number.isFinite(threshold) && elapsedSec >= threshold;
}

export function toScrobbleTrack(
  track: MediaFile,
  durationSec: number,
  startedAt: number
): ScrobbleTrack | null {
  const meta = track.metadata;
  const artist = (meta?.artist || meta?.albumArtist || '').trim();
  const title = (meta?.title || track.name || '').trim();
  if (!artist || !title) return null;
  return {
    artist,
    title,
    ...(meta?.album?.trim() ? { album: meta.album.trim() } : {}),
    ...(Number.isFinite(durationSec) && durationSec > 0
      ? { durationSec: Math.round(durationSec) }
      : {}),
    ...(meta?.track?.no ? { trackNumber: meta.track.no } : {}),
    ...(startedAt > 0 ? { startedAt } : {})
  };
}
