import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSession,
  getToken,
  getUserInfo,
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
    expect(signParams({ api_key: 'abc', method: 'auth.getToken', callback: 'cb' }, 'secret')).toBe(
      hash
    );
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

  it('rejects a token response without a token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(getToken('key', 'secret')).rejects.toThrow('brak tokenu');
  });

  it('rejects a non-JSON response with the status and body prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'x'.repeat(300)
      })
    );

    await expect(getToken('key', 'secret')).rejects.toThrow(/Last\.fm HTTP 502: x{180}/);
  });

  it('falls back to the HTTP status when the error has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{}' })
    );

    await expect(getToken('key', 'secret')).rejects.toThrow('Last.fm: HTTP 401');
  });

  it('rejects an invalid session payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ session: { name: 'x' } })));

    await expect(getSession('key', 'secret', 'tok')).rejects.toThrow('nieprawidłowa sesja');
  });

  it('reads the user name from user.getInfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: { name: 'listener' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getUserInfo('key', 'secret', 'sk')).resolves.toBe('listener');
    const body = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.get('method')).toBe('user.getInfo');
    expect(body.get('sk')).toBe('sk');

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: {} }));
    await expect(getUserInfo('key', 'secret', 'sk')).resolves.toBe('');
  });

  it('falls back to the current time for the scrobble timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await scrobble('key', 'secret', 'session', {
      artist: 'Artist',
      title: 'Title',
      durationSec: Number.NaN,
      trackNumber: 4
    });
    const body = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.get('timestamp')).toBe('1800000000');
    expect(body.get('duration')).toBeNull();
    expect(body.get('trackNumber')).toBe('4');
    vi.restoreAllMocks();
  });

  it('omits optional now-playing fields when invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await updateNowPlaying('key', 'secret', 'session', {
      artist: 'Artist',
      title: 'Title',
      trackNumber: Number.POSITIVE_INFINITY
    });
    const body = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.get('album')).toBeNull();
    expect(body.get('duration')).toBeNull();
    expect(body.get('trackNumber')).toBeNull();
  });
});
