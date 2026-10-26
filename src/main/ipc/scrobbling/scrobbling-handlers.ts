import { ipcMain, shell } from 'electron';
import { logger } from '../../../shared/logger';
import type {
  ScrobbleTrack,
  ScrobblingService
} from '../../../shared/types/ipc/channels-scrobbling';
import {
  readScrobblingConfig,
  readScrobblingStatus,
  type ScrobblingConfig
} from './scrobbling-config';
import * as lastfm from './lastfm';
import * as listenbrainz from './listenbrainz';
import { drainScrobbleQueue, enqueueScrobble, scrobbleQueuePath } from './scrobble-queue';

let pendingLastfmToken: string | null = null;

function cleanTrack(input: unknown): ScrobbleTrack | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  const artist = typeof source.artist === 'string' ? source.artist.trim() : '';
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!artist || !title) return null;
  return {
    artist,
    title,
    ...(typeof source.album === 'string' && source.album.trim()
      ? { album: source.album.trim() }
      : {}),
    ...(typeof source.durationSec === 'number' && Number.isFinite(source.durationSec)
      ? { durationSec: Math.max(0, source.durationSec) }
      : {}),
    ...(typeof source.trackNumber === 'number' && Number.isFinite(source.trackNumber)
      ? { trackNumber: source.trackNumber }
      : {}),
    ...(typeof source.startedAt === 'number' && Number.isFinite(source.startedAt)
      ? { startedAt: source.startedAt }
      : {})
  };
}

function lastfmReady(config: ScrobblingConfig): boolean {
  return !!(config.lastfm.apiKey && config.lastfm.apiSecret && config.lastfm.sessionKey);
}

async function sendToService(
  service: ScrobblingService,
  track: ScrobbleTrack,
  config: ScrobblingConfig
): Promise<void> {
  if (service === 'lastfm') {
    await lastfm.scrobble(
      config.lastfm.apiKey,
      config.lastfm.apiSecret,
      config.lastfm.sessionKey,
      track
    );
    return;
  }
  await listenbrainz.scrobble(config.listenbrainz.token, track);
}

async function sendNowPlaying(track: ScrobbleTrack): Promise<void> {
  const config = await readScrobblingConfig();
  const jobs: Array<Promise<void>> = [];
  if (config.lastfm.enabled && lastfmReady(config)) {
    jobs.push(
      lastfm.updateNowPlaying(
        config.lastfm.apiKey,
        config.lastfm.apiSecret,
        config.lastfm.sessionKey,
        track
      )
    );
  }
  if (config.listenbrainz.enabled && config.listenbrainz.token) {
    jobs.push(listenbrainz.submitNowPlaying(config.listenbrainz.token, track));
  }
  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn('scrobbling', 'now-playing failed', result.reason);
    }
  }
}

async function sendScrobble(track: ScrobbleTrack): Promise<void> {
  const config = await readScrobblingConfig();
  const path = scrobbleQueuePath();
  if (config.lastfm.enabled && lastfmReady(config)) {
    try {
      await sendToService('lastfm', track, config);
    } catch (e) {
      logger.warn('scrobbling', 'lastfm scrobble failed, queued for retry', e);
      await enqueueScrobble(path, 'lastfm', track);
    }
  }
  if (config.listenbrainz.enabled && config.listenbrainz.token) {
    try {
      await sendToService('listenbrainz', track, config);
    } catch (e) {
      logger.warn('scrobbling', 'listenbrainz scrobble failed, queued for retry', e);
      await enqueueScrobble(path, 'listenbrainz', track);
    }
  }
}

async function flushQueue(): Promise<void> {
  const path = scrobbleQueuePath();
  await drainScrobbleQueue(path, async (service, track) => {
    const config = await readScrobblingConfig();
    try {
      await sendToService(service, track, config);
      return true;
    } catch {
      return false;
    }
  });
}

export function registerScrobblingHandlers(): void {
  ipcMain.handle('scrobbling:status', () => readScrobblingStatus());

  ipcMain.handle('scrobbling:test', async (_event, service: unknown) => {
    if (service !== 'lastfm' && service !== 'listenbrainz') {
      return { ok: false, error: 'Unknown service' };
    }
    try {
      const config = await readScrobblingConfig();
      if (service === 'lastfm') {
        if (!config.lastfm.apiKey || !config.lastfm.apiSecret || !config.lastfm.sessionKey) {
          return { ok: false, error: 'Last.fm is not connected' };
        }
        const username = await lastfm.getUserInfo(
          config.lastfm.apiKey,
          config.lastfm.apiSecret,
          config.lastfm.sessionKey
        );
        return { ok: true, ...(username ? { username } : {}) };
      }
      if (!config.listenbrainz.token) {
        return { ok: false, error: 'ListenBrainz token is missing' };
      }
      const { username } = await listenbrainz.validateToken(config.listenbrainz.token);
      return { ok: true, ...(username ? { username } : {}) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('scrobbling:lastfmAuth', async () => {
    try {
      const config = await readScrobblingConfig();
      if (!config.lastfm.apiKey || !config.lastfm.apiSecret) {
        return { ok: false, error: 'Enter the Last.fm API key and secret first' };
      }
      const token = await lastfm.getToken(config.lastfm.apiKey, config.lastfm.apiSecret);
      pendingLastfmToken = token;
      const url = `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(
        config.lastfm.apiKey
      )}&token=${encodeURIComponent(token)}`;
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('scrobbling:lastfmAuthComplete', async () => {
    if (!pendingLastfmToken) {
      return { ok: false, error: 'No pending Last.fm authorization' };
    }
    try {
      const config = await readScrobblingConfig();
      const session = await lastfm.getSession(
        config.lastfm.apiKey,
        config.lastfm.apiSecret,
        pendingLastfmToken
      );
      pendingLastfmToken = null;
      return { ok: true, sessionKey: session.sessionKey, username: session.username };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('scrobbling:nowPlaying', async (_event, input: unknown) => {
    const track = cleanTrack(input);
    if (!track) return;
    await sendNowPlaying(track);
  });

  ipcMain.handle('scrobbling:scrobble', async (_event, input: unknown) => {
    const track = cleanTrack(input);
    if (!track) return;
    await sendScrobble(track);
  });

  // Kolejka offline: spróbuj po starcie, bez blokowania okna.
  setTimeout(() => {
    void flushQueue().catch((e) => logger.warn('scrobbling', 'queue flush failed', e));
  }, 3000).unref?.();
}
