import { createHash } from 'crypto';
import type { ScrobbleTrack } from '../../../shared/types/ipc/channels-scrobbling';

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
const TIMEOUT_MS = 15000;

/**
 * Last.fm: `api_sig` = MD5(posortowane `klucz+wartość` + sekret).
 * `format` i `callback` są wyłączone z podpisu (wymóg API).
 */
export function signParams(params: Record<string, string>, secret: string): string {
  const base = Object.entries(params)
    .filter(([key]) => key !== 'format' && key !== 'callback')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}${value}`)
    .join('');
  return createHash('md5')
    .update(base + secret, 'utf8')
    .digest('hex');
}

export function signedParams(
  apiKey: string,
  secret: string,
  method: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  const params: Record<string, string> = { api_key: apiKey, method, ...extra };
  return { ...params, api_sig: signParams(params, secret), format: 'json' };
}

function trackFields(track: ScrobbleTrack): Record<string, string> {
  const fields: Record<string, string> = {
    artist: track.artist,
    track: track.title
  };
  if (track.album) fields.album = track.album;
  if (track.durationSec && Number.isFinite(track.durationSec)) {
    fields.duration = String(Math.max(0, Math.round(track.durationSec)));
  }
  if (track.trackNumber && Number.isFinite(track.trackNumber)) {
    fields.trackNumber = String(Math.round(track.trackNumber));
  }
  return fields;
}

async function post(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(LASTFM_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Last.fm HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  if (!res.ok || json.error) {
    const message = typeof json.message === 'string' ? json.message : `HTTP ${res.status}`;
    throw new Error(`Last.fm: ${message}`);
  }
  return json;
}

export async function getToken(apiKey: string, secret: string): Promise<string> {
  const json = await post(signedParams(apiKey, secret, 'auth.getToken'));
  if (typeof json.token !== 'string') throw new Error('Last.fm: brak tokenu');
  return json.token;
}

export async function getSession(
  apiKey: string,
  secret: string,
  token: string
): Promise<{ username: string; sessionKey: string }> {
  const json = await post(signedParams(apiKey, secret, 'auth.getSession', { token }));
  const session = json.session as { name?: unknown; key?: unknown } | undefined;
  if (typeof session?.key !== 'string' || typeof session.name !== 'string') {
    throw new Error('Last.fm: nieprawidłowa sesja');
  }
  return { username: session.name, sessionKey: session.key };
}

export async function getUserInfo(
  apiKey: string,
  secret: string,
  sessionKey: string
): Promise<string> {
  const json = await post(signedParams(apiKey, secret, 'user.getInfo', { sk: sessionKey }));
  const user = json.user as { name?: unknown } | undefined;
  return typeof user?.name === 'string' ? user.name : '';
}

export async function updateNowPlaying(
  apiKey: string,
  secret: string,
  sessionKey: string,
  track: ScrobbleTrack
): Promise<void> {
  await post(
    signedParams(apiKey, secret, 'track.updateNowPlaying', {
      ...trackFields(track),
      sk: sessionKey
    })
  );
}

export async function scrobble(
  apiKey: string,
  secret: string,
  sessionKey: string,
  track: ScrobbleTrack
): Promise<void> {
  const timestamp =
    track.startedAt && track.startedAt > 0 ? track.startedAt : Math.floor(Date.now() / 1000);
  await post(
    signedParams(apiKey, secret, 'track.scrobble', {
      ...trackFields(track),
      timestamp: String(timestamp),
      sk: sessionKey
    })
  );
}
