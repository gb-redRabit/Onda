import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  detectScKind: vi.fn(),
  normalizeScUrl: vi.fn((url: string) => url.trim()),
  redactSecrets: vi.fn((value: string) => `redacted:${value}`),
  runYtDlp: vi.fn(),
  parseStreamGetOutput: vi.fn(),
  readNetworkArgs: vi.fn(async () => ['--proxy', 'socks5://127.0.0.1:9999']),
  scTrackStreamUrl: vi.fn(),
  extractSignedUrlExpiryMs: vi.fn(),
  errorCodeOf: vi.fn()
}));

vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../../../shared/soundcloud', () => ({
  detectScKind: state.detectScKind,
  normalizeScUrl: state.normalizeScUrl
}));
vi.mock('../../downloads/error-classifier', () => ({
  redactSecrets: state.redactSecrets
}));
vi.mock('../youtube/youtube-handlers', () => ({ runYtDlp: state.runYtDlp }));
vi.mock('../youtube/youtube-utils', () => ({
  parseStreamGetOutput: state.parseStreamGetOutput
}));
vi.mock('../proxy-utils', () => ({ readNetworkArgs: state.readNetworkArgs }));
vi.mock('../soundcloud/soundcloud-client', () => ({
  scTrackStreamUrl: state.scTrackStreamUrl,
  extractSignedUrlExpiryMs: state.extractSignedUrlExpiryMs
}));
vi.mock('../soundcloud/soundcloud-error', () => ({ errorCodeOf: state.errorCodeOf }));

async function load() {
  return import('../soundcloud/soundcloud-stream');
}

const TRACK = 'https://soundcloud.com/artist/track';

beforeEach(() => {
  vi.resetModules();
  state.loggerWarn.mockReset();
  state.detectScKind.mockReset();
  state.detectScKind.mockReturnValue('video');
  state.normalizeScUrl.mockClear();
  state.redactSecrets.mockClear();
  state.runYtDlp.mockReset();
  state.runYtDlp.mockResolvedValue('https://cdn.example/stream.mp3');
  state.parseStreamGetOutput.mockReset();
  state.parseStreamGetOutput.mockReturnValue({ ok: true, url: 'https://cdn.example/stream.mp3' });
  state.readNetworkArgs.mockReset();
  state.readNetworkArgs.mockResolvedValue(['--proxy', 'socks5://127.0.0.1:9999']);
  state.scTrackStreamUrl.mockReset();
  state.scTrackStreamUrl.mockResolvedValue({ url: 'https://cdn.example/api.mp3' });
  state.extractSignedUrlExpiryMs.mockReset();
  state.extractSignedUrlExpiryMs.mockReturnValue(null);
  state.errorCodeOf.mockReset();
  state.errorCodeOf.mockReturnValue('network');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('validation', () => {
  it('rejects non-string, blank, oversized and unrecognised links', async () => {
    const { getScStreamUrl } = await load();
    const invalid = { success: false, error: 'Invalid SoundCloud track link', code: 'invalid' };

    expect(await getScStreamUrl(undefined as unknown as string)).toEqual(invalid);
    expect(await getScStreamUrl('   ')).toEqual(invalid);
    expect(await getScStreamUrl(`https://soundcloud.com/${'a'.repeat(2048)}`)).toEqual(invalid);
    state.detectScKind.mockReturnValue(null);
    expect(await getScStreamUrl('https://example.com/x')).toEqual(invalid);
    expect(state.scTrackStreamUrl).not.toHaveBeenCalled();
  });

  it('rejects profile links', async () => {
    state.detectScKind.mockReturnValue('channel');
    const { getScStreamUrl } = await load();

    expect(await getScStreamUrl('https://soundcloud.com/artist')).toEqual({
      success: false,
      error: 'Profiles have no stream — open a track',
      code: 'invalid'
    });
  });

  it('treats a bare numeric id as a track without probing the URL shape', async () => {
    state.scTrackStreamUrl.mockResolvedValue({ url: 'https://cdn.example/id.mp3' });
    const { getScStreamUrl } = await load();

    expect(await getScStreamUrl(' 12345 ')).toEqual({
      success: true,
      url: 'https://cdn.example/id.mp3'
    });
    expect(state.scTrackStreamUrl).toHaveBeenCalledWith('12345');
    expect(state.detectScKind).not.toHaveBeenCalled();
  });

  it('normalises the cache key', async () => {
    const { getScStreamUrl } = await load();

    await getScStreamUrl(`  ${TRACK}  `);
    await getScStreamUrl(TRACK);

    expect(state.normalizeScUrl).toHaveBeenCalledTimes(2);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(1);
  });
});

describe('API resolution', () => {
  it('returns the progressive stream and caches it', async () => {
    const { getScStreamUrl } = await load();
    const first = await getScStreamUrl(TRACK);

    expect(first).toEqual({ success: true, url: 'https://cdn.example/api.mp3' });
    expect(state.scTrackStreamUrl).toHaveBeenCalledWith(TRACK);
    expect(state.runYtDlp).not.toHaveBeenCalled();

    const second = await getScStreamUrl(TRACK);
    expect(second).toEqual(first);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(1);
  });

  it('falls back to yt-dlp when the API has no progressive stream', async () => {
    state.scTrackStreamUrl.mockResolvedValue(null);
    const { getScStreamUrl } = await load();

    const result = await getScStreamUrl(TRACK);

    expect(result).toEqual({ success: true, url: 'https://cdn.example/stream.mp3' });
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(1);
    expect(state.runYtDlp).toHaveBeenCalledTimes(1);
    expect(state.runYtDlp.mock.calls[0][0]).toEqual([
      TRACK,
      '--no-playlist',
      '-f',
      'ba[protocol^=https]/bestaudio[protocol^=https]/b[protocol^=https]/w',
      '-g',
      '-4',
      '--no-warnings',
      '--proxy',
      'socks5://127.0.0.1:9999'
    ]);
    expect(state.runYtDlp.mock.calls[0][1]).toBe(30000);
    expect(state.readNetworkArgs).toHaveBeenCalledWith('soundcloud');
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'sc',
      `no progressive transcoding, falling back to yt-dlp url=${TRACK}`
    );
  });

  it('falls back when the API throws', async () => {
    state.scTrackStreamUrl.mockRejectedValue(new Error('rotated'));
    const { getScStreamUrl } = await load();

    const result = await getScStreamUrl(TRACK);

    expect(result).toEqual({ success: true, url: 'https://cdn.example/stream.mp3' });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'sc',
      `api stream failed, falling back to yt-dlp url=${TRACK}`,
      'Error: rotated'
    );
  });

  it('deduplicates concurrent resolutions', async () => {
    let release: ((value: { url: string }) => void) | null = null;
    state.scTrackStreamUrl.mockImplementation(
      () =>
        new Promise<{ url: string }>((resolve) => {
          release = resolve;
        })
    );
    const { getScStreamUrl } = await load();

    const first = getScStreamUrl(TRACK);
    const second = getScStreamUrl(TRACK);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(1);

    release!({ url: 'https://cdn.example/shared.mp3' });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { success: true, url: 'https://cdn.example/shared.mp3' },
      { success: true, url: 'https://cdn.example/shared.mp3' }
    ]);
  });

  it('evicts the oldest entry beyond the cache limit', async () => {
    state.scTrackStreamUrl.mockImplementation(async (url: string) => ({
      url: `https://cdn.example/${encodeURIComponent(url)}`
    }));
    const { getScStreamUrl, STREAM_CACHE_MAX } = await load();

    for (let i = 0; i < STREAM_CACHE_MAX; i++) {
      await getScStreamUrl(`${TRACK}-${i}`);
    }
    await getScStreamUrl(`${TRACK}-${STREAM_CACHE_MAX}`);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(STREAM_CACHE_MAX + 1);

    // The first URL was evicted, so it is resolved again.
    await getScStreamUrl(`${TRACK}-0`);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(STREAM_CACHE_MAX + 2);
  });

  it('re-resolves an expired cached URL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { getScStreamUrl } = await load();

    await getScStreamUrl(TRACK);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'));
    await getScStreamUrl(TRACK);
    expect(state.scTrackStreamUrl).toHaveBeenCalledTimes(2);
  });
});

describe('fallback errors', () => {
  it('maps HLS output to a readable error', async () => {
    state.scTrackStreamUrl.mockResolvedValue(null);
    state.parseStreamGetOutput.mockReturnValue({ ok: false, code: 'hls' });
    const { getScStreamUrl } = await load();

    expect(await getScStreamUrl(TRACK)).toEqual({
      success: false,
      error: 'HLS streams are not supported yet',
      code: 'hls'
    });
  });

  it('maps unusable output to an invalid error', async () => {
    state.scTrackStreamUrl.mockResolvedValue(null);
    state.parseStreamGetOutput.mockReturnValue({ ok: false });
    const { getScStreamUrl } = await load();

    expect(await getScStreamUrl(TRACK)).toEqual({
      success: false,
      error: 'Invalid stream URL',
      code: 'invalid'
    });
  });

  it('redacts thrown errors and classifies them', async () => {
    state.scTrackStreamUrl.mockResolvedValue(null);
    state.runYtDlp.mockRejectedValue(new Error('token=secret'));
    const { getScStreamUrl } = await load();

    expect(await getScStreamUrl(TRACK)).toEqual({
      success: false,
      error: 'redacted:token=secret',
      code: 'network'
    });
    expect(state.redactSecrets).toHaveBeenCalledWith('token=secret');
    expect(state.errorCodeOf).toHaveBeenCalledWith(expect.any(Error));
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'sc',
      `stream fallback failed url=${TRACK}`,
      'redacted:token=secret'
    );
  });

  it('stringifies non-error rejection values', async () => {
    state.scTrackStreamUrl.mockResolvedValue(null);
    state.runYtDlp.mockRejectedValue('plain failure');
    const { getScStreamUrl } = await load();

    expect(await getScStreamUrl(TRACK)).toEqual({
      success: false,
      error: 'redacted:plain failure',
      code: 'network'
    });
    expect(state.redactSecrets).toHaveBeenCalledWith('plain failure');
  });
});

describe('streamCacheExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('uses the fallback TTL without a signed expiry', async () => {
    const { streamCacheExpiry } = await load();
    expect(streamCacheExpiry('https://cdn.example/a.mp3')).toBe(Date.now() + 10 * 60 * 1000);
  });

  it('expires a minute before the signature', async () => {
    const { streamCacheExpiry } = await load();
    state.extractSignedUrlExpiryMs.mockReturnValue(Date.now() + 5 * 60 * 1000);

    expect(streamCacheExpiry('https://cdn.example/a.mp3')).toBe(Date.now() + 4 * 60 * 1000);
  });

  it('never keeps a signed URL longer than the fallback TTL', async () => {
    const { streamCacheExpiry } = await load();
    state.extractSignedUrlExpiryMs.mockReturnValue(Date.now() + 30 * 60 * 1000);

    expect(streamCacheExpiry('https://cdn.example/a.mp3')).toBe(Date.now() + 10 * 60 * 1000);
  });

  it('keeps an already expired signature for a short grace period', async () => {
    const { streamCacheExpiry } = await load();
    state.extractSignedUrlExpiryMs.mockReturnValue(Date.now() - 60_000);

    expect(streamCacheExpiry('https://cdn.example/a.mp3')).toBe(Date.now() + 5000);
  });
});
