import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  openExternal: vi.fn(),
  warn: vi.fn(),
  readConfig: vi.fn(),
  readStatus: vi.fn(),
  lastfm: {
    scrobble: vi.fn(),
    updateNowPlaying: vi.fn(),
    getUserInfo: vi.fn(),
    getToken: vi.fn(),
    getSession: vi.fn()
  },
  listenbrainz: {
    scrobble: vi.fn(),
    submitNowPlaying: vi.fn(),
    validateToken: vi.fn()
  },
  drain: vi.fn(),
  enqueue: vi.fn(),
  queuePath: vi.fn(() => 'C:/queue.json')
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  },
  shell: { openExternal: state.openExternal }
}));
vi.mock('../../../../shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../scrobbling-config', () => ({
  readScrobblingConfig: state.readConfig,
  readScrobblingStatus: state.readStatus
}));
vi.mock('../lastfm', () => state.lastfm);
vi.mock('../listenbrainz', () => state.listenbrainz);
vi.mock('../scrobble-queue', () => ({
  drainScrobbleQueue: state.drain,
  enqueueScrobble: state.enqueue,
  scrobbleQueuePath: state.queuePath
}));

async function load() {
  vi.resetModules();
  const module = await import('../scrobbling-handlers');
  module.registerScrobblingHandlers();
  return state.handlers;
}

function config(overrides: Record<string, unknown> = {}) {
  return {
    lastfm: {
      enabled: true,
      apiKey: 'key',
      apiSecret: 'secret',
      sessionKey: 'session',
      ...(overrides.lastfm as object)
    },
    listenbrainz: {
      enabled: true,
      token: 'token',
      ...(overrides.listenbrainz as object)
    }
  };
}

function track(overrides: Record<string, unknown> = {}) {
  return {
    artist: ' Artist ',
    title: ' Title ',
    album: ' Album ',
    durationSec: 120,
    trackNumber: 3,
    startedAt: 1000,
    ...overrides
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.handlers = {};
  state.openExternal.mockReset();
  state.warn.mockReset();
  state.readConfig.mockReset();
  state.readConfig.mockResolvedValue(config());
  state.readStatus.mockReset();
  state.readStatus.mockReturnValue({ lastfm: true, listenbrainz: false });
  for (const fn of Object.values(state.lastfm)) fn.mockReset();
  for (const fn of Object.values(state.listenbrainz)) fn.mockReset();
  state.lastfm.scrobble.mockResolvedValue(undefined);
  state.lastfm.updateNowPlaying.mockResolvedValue(undefined);
  state.lastfm.getUserInfo.mockResolvedValue('listener');
  state.lastfm.getToken.mockResolvedValue('request-token');
  state.lastfm.getSession.mockResolvedValue({ sessionKey: 'session-key', username: 'user' });
  state.listenbrainz.scrobble.mockResolvedValue(undefined);
  state.listenbrainz.submitNowPlaying.mockResolvedValue(undefined);
  state.listenbrainz.validateToken.mockResolvedValue({ username: 'lb-user' });
  state.drain.mockReset();
  state.drain.mockResolvedValue(undefined);
  state.enqueue.mockReset();
  state.enqueue.mockResolvedValue(undefined);
  state.queuePath.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registration', () => {
  it('registers every scrobbling channel', async () => {
    const handlers = await load();
    expect(Object.keys(handlers).sort()).toEqual(
      [
        'scrobbling:status',
        'scrobbling:test',
        'scrobbling:lastfmAuth',
        'scrobbling:lastfmAuthComplete',
        'scrobbling:nowPlaying',
        'scrobbling:scrobble'
      ].sort()
    );
  });

  it('returns the stored status', async () => {
    const handlers = await load();
    expect(handlers['scrobbling:status']()).toEqual({ lastfm: true, listenbrainz: false });
  });
});

describe('connection tests', () => {
  it('rejects unknown services', async () => {
    const handlers = await load();
    await expect(handlers['scrobbling:test']({}, 'other')).resolves.toEqual({
      ok: false,
      error: 'Unknown service'
    });
  });

  it('checks Last.fm credentials and username', async () => {
    const handlers = await load();
    await expect(handlers['scrobbling:test']({}, 'lastfm')).resolves.toEqual({
      ok: true,
      username: 'listener'
    });
    expect(state.lastfm.getUserInfo).toHaveBeenCalledWith('key', 'secret', 'session');

    state.lastfm.getUserInfo.mockResolvedValueOnce(null);
    await expect(handlers['scrobbling:test']({}, 'lastfm')).resolves.toEqual({ ok: true });

    state.readConfig.mockResolvedValueOnce(config({ lastfm: { sessionKey: '' } }));
    await expect(handlers['scrobbling:test']({}, 'lastfm')).resolves.toEqual({
      ok: false,
      error: 'Last.fm is not connected'
    });
  });

  it('checks ListenBrainz tokens and reports failures', async () => {
    const handlers = await load();
    await expect(handlers['scrobbling:test']({}, 'listenbrainz')).resolves.toEqual({
      ok: true,
      username: 'lb-user'
    });

    state.readConfig.mockResolvedValueOnce(config({ listenbrainz: { token: '' } }));
    await expect(handlers['scrobbling:test']({}, 'listenbrainz')).resolves.toEqual({
      ok: false,
      error: 'ListenBrainz token is missing'
    });

    state.listenbrainz.validateToken.mockRejectedValueOnce(new Error('invalid token'));
    await expect(handlers['scrobbling:test']({}, 'listenbrainz')).resolves.toEqual({
      ok: false,
      error: 'invalid token'
    });

    state.readConfig.mockRejectedValueOnce('plain failure');
    await expect(handlers['scrobbling:test']({}, 'lastfm')).resolves.toEqual({
      ok: false,
      error: 'plain failure'
    });
  });
});

describe('Last.fm authorization', () => {
  it('requires API credentials', async () => {
    const handlers = await load();
    state.readConfig.mockResolvedValueOnce(config({ lastfm: { apiKey: '' } }));
    await expect(handlers['scrobbling:lastfmAuth']()).resolves.toEqual({
      ok: false,
      error: 'Enter the Last.fm API key and secret first'
    });
  });

  it('starts authorization and opens the browser', async () => {
    const handlers = await load();
    await expect(handlers['scrobbling:lastfmAuth']()).resolves.toEqual({ ok: true });
    expect(state.lastfm.getToken).toHaveBeenCalledWith('key', 'secret');
    expect(state.openExternal).toHaveBeenCalledWith(
      'https://www.last.fm/api/auth/?api_key=key&token=request-token'
    );
  });

  it('completes authorization using the pending token', async () => {
    const handlers = await load();
    await handlers['scrobbling:lastfmAuth']();

    await expect(handlers['scrobbling:lastfmAuthComplete']()).resolves.toEqual({
      ok: true,
      sessionKey: 'session-key',
      username: 'user'
    });

    await expect(handlers['scrobbling:lastfmAuthComplete']()).resolves.toEqual({
      ok: false,
      error: 'No pending Last.fm authorization'
    });
  });

  it('reports authorization failures', async () => {
    let handlers = await load();
    state.lastfm.getToken.mockRejectedValueOnce(new Error('token failed'));
    await expect(handlers['scrobbling:lastfmAuth']()).resolves.toEqual({
      ok: false,
      error: 'token failed'
    });

    handlers = await load();
    await handlers['scrobbling:lastfmAuth']();
    state.lastfm.getSession.mockRejectedValueOnce(new Error('session failed'));
    await expect(handlers['scrobbling:lastfmAuthComplete']()).resolves.toEqual({
      ok: false,
      error: 'session failed'
    });
  });
});

describe('now playing', () => {
  it('ignores invalid tracks', async () => {
    const handlers = await load();
    await handlers['scrobbling:nowPlaying']({}, null);
    await handlers['scrobbling:nowPlaying']({}, { artist: 'A' });
    await handlers['scrobbling:nowPlaying']({}, { artist: '  ', title: 'T' });
    expect(state.lastfm.updateNowPlaying).not.toHaveBeenCalled();
  });

  it('sends both services a cleaned track', async () => {
    const handlers = await load();
    await handlers['scrobbling:nowPlaying']({}, track({ album: '  ', durationSec: -5 }));

    const cleaned = {
      artist: 'Artist',
      title: 'Title',
      durationSec: 0,
      trackNumber: 3,
      startedAt: 1000
    };
    expect(state.lastfm.updateNowPlaying).toHaveBeenCalledWith('key', 'secret', 'session', cleaned);
    expect(state.listenbrainz.submitNowPlaying).toHaveBeenCalledWith('token', cleaned);
  });

  it('skips disabled or unready services and logs rejections', async () => {
    let handlers = await load();
    state.readConfig.mockResolvedValueOnce(config({ lastfm: { enabled: false } }));
    await handlers['scrobbling:nowPlaying']({}, track());
    expect(state.lastfm.updateNowPlaying).not.toHaveBeenCalled();
    expect(state.listenbrainz.submitNowPlaying).toHaveBeenCalled();
    state.listenbrainz.submitNowPlaying.mockClear();

    handlers = await load();
    state.readConfig.mockResolvedValueOnce(config({ listenbrainz: { enabled: false } }));
    await handlers['scrobbling:nowPlaying']({}, track());
    expect(state.lastfm.updateNowPlaying).toHaveBeenCalled();
    expect(state.listenbrainz.submitNowPlaying).not.toHaveBeenCalled();

    handlers = await load();
    state.lastfm.updateNowPlaying.mockRejectedValueOnce(new Error('down'));
    await handlers['scrobbling:nowPlaying']({}, track());
    expect(state.warn).toHaveBeenCalledWith('scrobbling', 'now-playing failed', expect.any(Error));
  });

  it('omits non-finite optional fields', async () => {
    const handlers = await load();
    await handlers['scrobbling:nowPlaying'](
      {},
      track({
        album: '',
        durationSec: Number.POSITIVE_INFINITY,
        trackNumber: Number.NaN,
        startedAt: Number.POSITIVE_INFINITY
      })
    );
    expect(state.lastfm.updateNowPlaying).toHaveBeenCalledWith('key', 'secret', 'session', {
      artist: 'Artist',
      title: 'Title'
    });
  });
});

describe('scrobbling with retry queue', () => {
  it('ignores invalid tracks', async () => {
    const handlers = await load();
    await handlers['scrobbling:scrobble']({}, { artist: '', title: '' });
    expect(state.lastfm.scrobble).not.toHaveBeenCalled();
  });

  it('sends to both services when configured', async () => {
    const handlers = await load();
    await handlers['scrobbling:scrobble']({}, track());

    expect(state.lastfm.scrobble).toHaveBeenCalledWith(
      'key',
      'secret',
      'session',
      expect.objectContaining({ artist: 'Artist', title: 'Title' })
    );
    expect(state.listenbrainz.scrobble).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ artist: 'Artist' })
    );
    expect(state.enqueue).not.toHaveBeenCalled();
  });

  it('queues failed Last.fm and ListenBrainz scrobbles', async () => {
    const handlers = await load();
    state.lastfm.scrobble.mockRejectedValueOnce(new Error('lastfm down'));
    state.listenbrainz.scrobble.mockRejectedValueOnce(new Error('lb down'));

    await handlers['scrobbling:scrobble']({}, track());

    expect(state.enqueue).toHaveBeenCalledWith('C:/queue.json', 'lastfm', expect.any(Object));
    expect(state.enqueue).toHaveBeenCalledWith('C:/queue.json', 'listenbrainz', expect.any(Object));
    expect(state.warn).toHaveBeenCalledWith(
      'scrobbling',
      'lastfm scrobble failed, queued for retry',
      expect.any(Error)
    );
    expect(state.warn).toHaveBeenCalledWith(
      'scrobbling',
      'listenbrainz scrobble failed, queued for retry',
      expect.any(Error)
    );
  });

  it('skips disabled services', async () => {
    const handlers = await load();
    state.readConfig.mockResolvedValueOnce(
      config({ lastfm: { enabled: false }, listenbrainz: { enabled: false } })
    );
    await handlers['scrobbling:scrobble']({}, track());
    expect(state.lastfm.scrobble).not.toHaveBeenCalled();
    expect(state.listenbrainz.scrobble).not.toHaveBeenCalled();
  });
});

describe('offline queue flush', () => {
  it('flushes three seconds after startup', async () => {
    await load();
    expect(state.drain).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);

    expect(state.drain).toHaveBeenCalledWith('C:/queue.json', expect.any(Function));
    const send = state.drain.mock.calls[0][1];
    await expect(send('lastfm', track())).resolves.toBe(true);
    expect(state.lastfm.scrobble).toHaveBeenCalled();

    state.lastfm.scrobble.mockRejectedValueOnce(new Error('still down'));
    await expect(send('lastfm', track())).resolves.toBe(false);

    await expect(send('listenbrainz', track())).resolves.toBe(true);
    expect(state.listenbrainz.scrobble).toHaveBeenCalled();

    state.listenbrainz.scrobble.mockRejectedValueOnce(new Error('lb'));
    await expect(send('listenbrainz', track())).resolves.toBe(false);
  });

  it('logs drain failures', async () => {
    state.drain.mockRejectedValueOnce(new Error('queue corrupt'));
    await load();
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    expect(state.warn).toHaveBeenCalledWith('scrobbling', 'queue flush failed', expect.any(Error));
  });
});
