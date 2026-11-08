import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  classifyYtDlpError: vi.fn(),
  redactSecrets: vi.fn((value: string) => `redacted:${value}`),
  cacheStream: vi.fn(),
  getCachedStream: vi.fn(),
  buildStreamGetArgs: vi.fn(),
  parseStreamGetOutput: vi.fn(),
  detectYtKind: vi.fn(),
  readNetworkArgs: vi.fn(async () => ['--proxy', 'http://127.0.0.1:8080']),
  runYtDlp: vi.fn(),
  isHttpUrl: vi.fn(),
  resolveNetworkTarget: vi.fn(),
  registerGenericStreamUrl: vi.fn()
}));

vi.mock('../../../shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: state.loggerWarn, error: vi.fn() }
}));
vi.mock('../../downloads/error-classifier', () => ({
  classifyYtDlpError: state.classifyYtDlpError,
  redactSecrets: state.redactSecrets
}));
vi.mock('../youtube/youtube-stream-cache', () => ({
  cacheStream: state.cacheStream,
  getCachedStream: state.getCachedStream
}));
vi.mock('../youtube/youtube-utils', () => ({
  buildStreamGetArgs: state.buildStreamGetArgs,
  parseStreamGetOutput: state.parseStreamGetOutput,
  detectYtKind: state.detectYtKind
}));
vi.mock('../proxy-utils', () => ({ readNetworkArgs: state.readNetworkArgs }));
vi.mock('../youtube/youtube-fetch', () => ({ runYtDlp: state.runYtDlp }));
vi.mock('../../../shared/platform', () => ({ isHttpUrl: state.isHttpUrl }));
vi.mock('../network-target', () => ({ resolveNetworkTarget: state.resolveNetworkTarget }));
vi.mock('../../media/media-server-stream-registry', () => ({
  registerGenericStreamUrl: state.registerGenericStreamUrl
}));

async function load() {
  return import('../youtube/youtube-stream');
}

const VIDEO = 'https://www.youtube.com/watch?v=abc123';
const GENERIC = 'https://example.com/audio.mp3';
const STREAM = 'https://googlevideo.example/stream?x=1';

beforeEach(() => {
  vi.resetModules();
  state.loggerInfo.mockReset();
  state.loggerWarn.mockReset();
  state.classifyYtDlpError.mockReset();
  state.classifyYtDlpError.mockReturnValue('network');
  state.redactSecrets.mockClear();
  state.cacheStream.mockReset();
  state.getCachedStream.mockReset();
  state.getCachedStream.mockReturnValue(null);
  state.buildStreamGetArgs.mockReset();
  state.buildStreamGetArgs.mockReturnValue(['-g']);
  state.parseStreamGetOutput.mockReset();
  state.parseStreamGetOutput.mockReturnValue({ ok: true, url: STREAM });
  state.detectYtKind.mockReset();
  state.detectYtKind.mockReturnValue('video');
  state.readNetworkArgs.mockReset();
  state.readNetworkArgs.mockResolvedValue(['--proxy', 'http://127.0.0.1:8080']);
  state.runYtDlp.mockReset();
  state.runYtDlp.mockResolvedValue(STREAM);
  state.isHttpUrl.mockReset();
  state.isHttpUrl.mockReturnValue(true);
  state.resolveNetworkTarget.mockReset();
  state.resolveNetworkTarget.mockResolvedValue(undefined);
  state.registerGenericStreamUrl.mockReset();
  state.registerGenericStreamUrl.mockResolvedValue(undefined);
});

describe('validation', () => {
  it('rejects non-string, blank, oversized and non-http links', async () => {
    const { getStreamUrl } = await load();
    const invalid = { success: false, error: 'Invalid YouTube video link', code: 'invalid' };

    expect(await getStreamUrl(undefined as unknown as string)).toEqual(invalid);
    expect(await getStreamUrl('  ')).toEqual(invalid);
    expect(await getStreamUrl(`https://youtube.com/watch?v=${'a'.repeat(2048)}`)).toEqual(invalid);
    state.detectYtKind.mockReturnValue(null);
    state.isHttpUrl.mockReturnValue(false);
    expect(await getStreamUrl('ftp://example.com/x')).toEqual(invalid);
    expect(state.runYtDlp).not.toHaveBeenCalled();
  });
});

describe('cache', () => {
  it('returns a cached video stream without spawning yt-dlp', async () => {
    state.getCachedStream.mockReturnValue({ url: STREAM, expires: Date.now() + 1000 });
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({ success: true, url: STREAM });
    expect(state.runYtDlp).not.toHaveBeenCalled();
    expect(state.registerGenericStreamUrl).not.toHaveBeenCalled();
  });

  it('registers a cached generic stream before serving it', async () => {
    state.detectYtKind.mockReturnValue(null);
    state.getCachedStream.mockReturnValue({ url: STREAM, expires: Date.now() + 1000 });
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(GENERIC)).toEqual({ success: true, url: STREAM });
    expect(state.registerGenericStreamUrl).toHaveBeenCalledWith(STREAM);
  });

  it('reports a network error when the cached generic host is unreachable', async () => {
    state.detectYtKind.mockReturnValue(null);
    state.getCachedStream.mockReturnValue({ url: STREAM, expires: Date.now() + 1000 });
    state.registerGenericStreamUrl.mockRejectedValue(new Error('blocked'));
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(GENERIC)).toEqual({
      success: false,
      error: 'blocked',
      code: 'network'
    });
  });

  it('stringifies non-error registration failures', async () => {
    state.detectYtKind.mockReturnValue(null);
    state.getCachedStream.mockReturnValue({ url: STREAM, expires: Date.now() + 1000 });
    state.registerGenericStreamUrl.mockRejectedValue('nope');
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(GENERIC)).toEqual({
      success: false,
      error: 'nope',
      code: 'network'
    });
  });
});

describe('resolution', () => {
  it('resolves a video stream and caches it', async () => {
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({ success: true, url: STREAM });
    expect(state.resolveNetworkTarget).toHaveBeenCalledWith(VIDEO);
    expect(state.readNetworkArgs).toHaveBeenCalledWith('youtube');
    expect(state.buildStreamGetArgs).toHaveBeenCalledWith(
      VIDEO,
      ['--proxy', 'http://127.0.0.1:8080'],
      {
        fallback: false,
        generic: false
      }
    );
    expect(state.cacheStream).toHaveBeenCalledWith(VIDEO, STREAM);
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'yt',
      expect.stringContaining(`stream resolve ms=`)
    );
  });

  it('rejects a blocked network target before spawning yt-dlp', async () => {
    state.resolveNetworkTarget.mockRejectedValue(new Error('private host'));
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: false,
      error: 'private host',
      code: 'invalid'
    });
    expect(state.runYtDlp).not.toHaveBeenCalled();
  });

  it('stringifies non-error target failures', async () => {
    state.resolveNetworkTarget.mockRejectedValue('offline');
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: false,
      error: 'offline',
      code: 'invalid'
    });
  });

  it('retries once with fallback clients after an unusable result', async () => {
    state.parseStreamGetOutput
      .mockReturnValueOnce({ ok: false, code: 'invalid' })
      .mockReturnValueOnce({ ok: true, url: 'https://googlevideo.example/fallback' });
    state.runYtDlp
      .mockResolvedValueOnce('bad')
      .mockResolvedValueOnce('https://googlevideo.example/fallback');
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: true,
      url: 'https://googlevideo.example/fallback'
    });
    expect(state.buildStreamGetArgs.mock.calls[1][2]).toMatchObject({ fallback: true });
    expect(state.cacheStream).toHaveBeenCalledWith(VIDEO, 'https://googlevideo.example/fallback');
  });

  it('reports HLS when both attempts only produce a manifest', async () => {
    state.parseStreamGetOutput
      .mockReturnValueOnce({ ok: false, code: 'hls' })
      .mockReturnValueOnce({ ok: false, code: 'hls' });
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: false,
      error: 'HLS streams are not supported yet',
      code: 'hls'
    });
  });

  it('reports an invalid stream when the fallback output is unusable', async () => {
    state.parseStreamGetOutput
      .mockReturnValueOnce({ ok: false, code: 'invalid' })
      .mockReturnValueOnce({ ok: false });
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: false,
      error: 'Invalid stream URL',
      code: 'invalid'
    });
  });

  it('registers generic streams and reports unreachable hosts', async () => {
    state.detectYtKind.mockReturnValue(null);
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(GENERIC)).toEqual({ success: true, url: STREAM });
    expect(state.readNetworkArgs).toHaveBeenCalledWith('generic');
    expect(state.buildStreamGetArgs.mock.calls[0][2]).toMatchObject({ generic: true });
    expect(state.registerGenericStreamUrl).toHaveBeenCalledWith(STREAM);

    state.registerGenericStreamUrl.mockRejectedValueOnce(new Error('not public'));
    expect(await getStreamUrl(`${GENERIC}?v=2`)).toEqual({
      success: false,
      error: 'not public',
      code: 'network'
    });
    expect(state.cacheStream).toHaveBeenCalledTimes(1);
  });

  it('uses the default message for an unreachable generic host', async () => {
    state.detectYtKind.mockReturnValue(null);
    state.registerGenericStreamUrl.mockRejectedValueOnce({});
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(GENERIC)).toEqual({
      success: false,
      error: 'The extracted stream host is not publicly reachable',
      code: 'network'
    });
  });

  it('classifies yt-dlp failures after the fallback attempt', async () => {
    state.runYtDlp
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('fatal'));
    state.classifyYtDlpError.mockReturnValue('rate-limit');
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: false,
      error: 'redacted:fatal',
      code: 'rate-limit'
    });
    expect(state.loggerWarn).toHaveBeenCalledTimes(2);
    expect(state.loggerWarn.mock.calls[0][0]).toBe('yt');
    expect(state.loggerWarn.mock.calls[0][1]).toContain('retrying with fallback clients');
    expect(state.classifyYtDlpError).toHaveBeenCalledWith('fatal');
  });

  it('stringifies non-error yt-dlp rejections', async () => {
    state.runYtDlp.mockRejectedValueOnce('wire').mockRejectedValueOnce({});
    state.classifyYtDlpError.mockReturnValue('network');
    const { getStreamUrl } = await load();

    expect(await getStreamUrl(VIDEO)).toEqual({
      success: false,
      error: 'redacted:[object Object]',
      code: 'network'
    });
    expect(state.redactSecrets).toHaveBeenLastCalledWith('[object Object]');
  });

  it('deduplicates concurrent resolutions', async () => {
    let release: ((value: string) => void) | null = null;
    state.runYtDlp.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        })
    );
    const { getStreamUrl } = await load();

    const first = getStreamUrl(VIDEO);
    const second = getStreamUrl(VIDEO);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.runYtDlp).toHaveBeenCalledTimes(1);

    release!(STREAM);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { success: true, url: STREAM },
      { success: true, url: STREAM }
    ]);
  });
});
