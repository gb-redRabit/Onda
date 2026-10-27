import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSession,
  getToken,
  scrobble,
  signParams,
  signedParams,
  updateNowPlaying
} from '../lastfm';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Last.fm signing', () => {
  it('sorts params, excludes format/callback and appends the secret', () => {
    const hash = signParams({ api_key: 'abc', method: 'auth.getToken' }, 'secret');
    expect(hash).toBe('f86444211049e605f18c05a5964aabfc');
    expect(signParams({ format: 'json', api_key: 'abc', method: 'auth.getToken' }, 'secret')).toBe(
      hash
    );
    expect(signedParams('abc', 'secret', 'auth.getToken')).toMatchObject({
      api_key: 'abc',
      method: 'auth.getToken',
      format: 'json',
      api_sig: hash
    });
  });
});

describe('Last.fm API calls', () => {
  it('starts auth with auth.getToken', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'tok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getToken('key', 'secret')).resolves.toBe('tok');
    const body = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.get('method')).toBe('auth.getToken');
    expect(body.get('api_key')).toBe('key');
    expect(body.get('api_sig')).toHaveLength(32);
  });

  it('exchanges the token for a session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ session: { name: 'user', key: 'session' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSession('key', 'secret', 'tok')).resolves.toEqual({
      username: 'user',
      sessionKey: 'session'
    });
  });

  it('sends now playing with artist, track and session key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await updateNowPlaying('key', 'secret', 'session', {
      artist: 'Artist',
      title: 'Title',
      album: 'Album',
      durationSec: 123.4
    });
    const body = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.get('method')).toBe('track.updateNowPlaying');
    expect(body.get('artist')).toBe('Artist');
    expect(body.get('track')).toBe('Title');
    expect(body.get('album')).toBe('Album');
    expect(body.get('duration')).toBe('123');
    expect(body.get('sk')).toBe('session');
  });

  it('uses startedAt as the scrobble timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await scrobble('key', 'secret', 'session', {
      artist: 'Artist',
      title: 'Title',
      startedAt: 1_700_000_000
    });
    const body = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.get('method')).toBe('track.scrobble');
    expect(body.get('timestamp')).toBe('1700000000');
  });

  it('surfaces API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 9, message: 'Invalid session key' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getToken('key', 'secret')).rejects.toThrow('Invalid session key');
  });
});
