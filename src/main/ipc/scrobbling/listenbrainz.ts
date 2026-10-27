import type { ScrobbleTrack } from '../../../shared/types/ipc/channels-scrobbling';

const LISTENBRAINZ_API = 'https://api.listenbrainz.org/1';
const TIMEOUT_MS = 15000;

type ListenType = 'single' | 'playing_now';

export function buildTrackMetadata(track: ScrobbleTrack): Record<string, unknown> {
  const additional: Record<string, unknown> = {
    submission_client: 'Onda',
    media_player: 'Onda'
  };
  if (track.durationSec && Number.isFinite(track.durationSec)) {
    additional.duration_ms = Math.round(track.durationSec * 1000);
  }
  if (track.trackNumber && Number.isFinite(track.trackNumber)) {
    additional.tracknumber = Math.round(track.trackNumber);
  }
  return {
    artist_name: track.artist,
    track_name: track.title,
    ...(track.album ? { release_name: track.album } : {}),
    additional_info: additional
  };
}

export function buildListenPayload(
  track: ScrobbleTrack,
  type: ListenType
): { listen_type: ListenType; payload: Array<Record<string, unknown>> } {
  const item: Record<string, unknown> = { track_metadata: buildTrackMetadata(track) };
  if (type === 'single') {
    item.listened_at =
      track.startedAt && track.startedAt > 0 ? track.startedAt : Math.floor(Date.now() / 1000);
  }
  return { listen_type: type, payload: [item] };
}

export async function validateToken(token: string): Promise<{ username?: string }> {
  const res = await fetch(`${LISTENBRAINZ_API}/validate-token`, {
    headers: { Authorization: `Token ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const json = (await res.json().catch(() => ({}))) as {
    valid?: boolean;
    message?: string;
    user_name?: string;
  };
  if (!res.ok || json.valid !== true) {
    throw new Error(json.message || `ListenBrainz HTTP ${res.status}`);
  }
  return { username: typeof json.user_name === 'string' ? json.user_name : undefined };
}

async function submit(token: string, body: unknown): Promise<void> {
  const res = await fetch(`${LISTENBRAINZ_API}/submit-listens`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ListenBrainz HTTP ${res.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
  }
}

export async function submitNowPlaying(token: string, track: ScrobbleTrack): Promise<void> {
  await submit(token, buildListenPayload(track, 'playing_now'));
}

export async function scrobble(token: string, track: ScrobbleTrack): Promise<void> {
  await submit(token, buildListenPayload(track, 'single'));
}
