import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildListenPayload,
  buildTrackMetadata,
  scrobble,
  submitNowPlaying,
  validateToken
} from '../listenbrainz';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListenBrainz payloads', () => {
  it('builds track metadata with duration and track number', () => {
    expect(
      buildTrackMetadata({
        artist: 'Artist',
        title: 'Title',
        album: 'Album',
        durationSec: 65.4,
        trackNumber: 3
      })
    ).toEqual({
      artist_name: 'Artist',
      track_name: 'Title',
      release_name: 'Album',
      additional_info: {
        submission_client: 'Onda',
        media_player: 'Onda',
        duration_ms: 65400,
        tracknumber: 3
      }
    });
  });

  it('omits listened_at for playing_now and includes it for single', () => {
    const track = { artist: 'A', title: 'T', startedAt: 1_700_000_000 };
    expect(buildListenPayload(track, 'playing_now').payload[0]).not.toHaveProperty('listened_at');
    expect(buildListenPayload(track, 'single').payload[0].listened_at).toBe(1_700_000_000);
  });
});

describe('ListenBrainz API calls', () => {
  it('validates a token and returns the username', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ valid: true, user_name: 'user' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateToken('tok')).resolves.toEqual({ username: 'user' });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Token tok');
  });

  it('rejects an invalid token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ valid: false, message: 'Invalid token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateToken('tok')).rejects.toThrow('Invalid token');
  });

  it('submits a scrobble with the auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await scrobble('tok', { artist: 'A', title: 'T', startedAt: 1_700_000_000 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Token tok');
    expect(JSON.parse(init.body as string)).toMatchObject({
      listen_type: 'single',
      payload: [{ listened_at: 1_700_000_000 }]
    });
  });

  it('submits now playing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await submitNowPlaying('tok', { artist: 'A', title: 'T' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      listen_type: string;
    };
    expect(body.listen_type).toBe('playing_now');
  });
});
