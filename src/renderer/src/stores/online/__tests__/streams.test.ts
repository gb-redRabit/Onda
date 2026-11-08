import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  player: null as any,
  ui: null as any,
  target: vi.fn(),
  channel: vi.fn(),
  buildTrack: vi.fn(),
  errorMessage: vi.fn(),
  invoke: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: state.t } } }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@shared/logger', () => ({
  logger: { info: state.info, warn: state.warn, error: vi.fn() }
}));
vi.mock('@renderer/utils/onlineHelpers', () => ({
  streamTargetFor: state.target,
  streamChannelFor: state.channel,
  buildStreamTrack: state.buildTrack,
  streamErrorMessage: state.errorMessage
}));

async function load() {
  const { createOnlineStreams } = await import('../streams');
  return createOnlineStreams();
}

function item(id: string, overrides: Record<string, unknown> = {}) {
  return { id, title: `Item ${id}`, url: `https://youtube.com/watch?v=${id}`, ...overrides } as any;
}

beforeEach(() => {
  state.player = {
    queueLength: 0,
    queue: [],
    history: [],
    currentTrack: null,
    streamPending: null,
    enrichTrack: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(function (this: any, value: any) {
      this.currentTrack = value;
    }),
    clearQueue: vi.fn()
  };
  state.ui = { notify: vi.fn() };
  state.target.mockReset();
  state.target.mockImplementation((value: any) => value.url || `yt:${value.id}`);
  state.channel.mockReset();
  state.channel.mockImplementation((url: string) =>
    url.startsWith('yt:') ? 'yt:stream' : 'generic:stream'
  );
  state.buildTrack.mockReset();
  state.buildTrack.mockImplementation((value: any, url: string, index: number) => ({
    id: value.id,
    path: `path-${index}`,
    streamUrl: url
  }));
  state.errorMessage.mockReset();
  state.errorMessage.mockImplementation((_t: any, code: string) => `error:${code}`);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ success: true, url: 'https://stream.example/v.mp4' });
  state.info.mockReset();
  state.warn.mockReset();
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('queueSavedTrack', () => {
  it('resolves the stream, builds a track and queues it', async () => {
    state.player.queueLength = 3;
    const { queueSavedTrack } = await load();
    const video = { id: 'v1', title: 'Song', url: 'https://youtube.com/watch?v=v1' };

    await queueSavedTrack(video);

    expect(state.target).toHaveBeenCalledWith(video);
    expect(state.channel).toHaveBeenCalledWith('https://youtube.com/watch?v=v1');
    expect(state.invoke).toHaveBeenCalledWith('generic:stream', 'https://youtube.com/watch?v=v1');
    expect(state.buildTrack).toHaveBeenCalledWith(video, 'https://stream.example/v.mp4', 3);
    expect(state.player.enrichTrack).toHaveBeenCalledWith({
      id: 'v1',
      path: 'path-3',
      streamUrl: 'https://stream.example/v.mp4'
    });
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      { id: 'v1', path: 'path-3', streamUrl: 'https://stream.example/v.mp4' }
    ]);
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'saved.addedToQueue');
  });

  it('uses the yt channel for generated ids', async () => {
    const { queueSavedTrack } = await load();
    await queueSavedTrack({ id: 'x', title: 'X' });
    expect(state.invoke).toHaveBeenCalledWith('yt:stream', 'yt:x');
  });

  it('notifies on failed or missing results', async () => {
    const { queueSavedTrack } = await load();
    state.invoke.mockResolvedValueOnce({ success: false, code: 'rate-limited' });
    await queueSavedTrack({ id: 'a', title: 'A' });
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'A', 'error:rate-limited');
    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();

    state.invoke.mockResolvedValueOnce({ success: true, url: '' });
    await queueSavedTrack({ id: 'b', title: 'B' });
    expect(state.ui.notify).toHaveBeenLastCalledWith('error', 'B', 'error:network');

    state.invoke.mockResolvedValueOnce(undefined);
    await queueSavedTrack({ id: 'c', title: 'C' });
    expect(state.ui.notify).toHaveBeenLastCalledWith('error', 'C', 'error:network');
  });
});

describe('playAllStreams', () => {
  it('does nothing for an empty list', async () => {
    const { playAllStreams } = await load();
    await playAllStreams([]);
    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('promotes the first resolved item and rebuilds the queue in order', async () => {
    const { playAllStreams } = await load();
    const items = [item('a'), item('b'), item('c')];

    await playAllStreams(items);

    expect(state.player.streamPending).toBeNull();
    expect(state.player.setTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', path: 'path-0' })
    );
    expect(state.player.enrichTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'b' }),
      expect.objectContaining({ id: 'c' })
    ]);
    expect(state.player.addToQueueMultiple.mock.calls[0][0]).toHaveLength(2);
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('keeps the resolved order when workers finish out of order', async () => {
    const pending = new Map<string, (value: unknown) => void>();
    state.invoke.mockImplementation(
      (_channel: string, url: string) => new Promise((resolve) => pending.set(url, resolve))
    );
    const { playAllStreams } = await load();
    const promise = playAllStreams([item('a'), item('b'), item('c')]);
    await Promise.resolve();

    const resolvers = [...pending.entries()];
    resolvers
      .reverse()
      .forEach(([, resolve]) => resolve({ success: true, url: `https://stream/${Math.random()}` }));
    await promise;

    const queued = state.player.addToQueueMultiple.mock.calls[0][0];
    const ids = queued.map((track: any) => track.id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('reports failures and drops missing items', async () => {
    state.invoke.mockImplementation(async (_channel: string, url: string) => {
      if (url.includes('v=b')) return { success: false, code: 'network' };
      return { success: true, url: 'https://stream/x' };
    });
    const { playAllStreams } = await load();
    await playAllStreams([item('a'), item('b'), item('c')]);

    expect(state.ui.notify).toHaveBeenCalledWith(
      'warning',
      'youtube.playAll',
      'youtube.playAllFailures:{"count":1}'
    );
    expect(state.player.addToQueueMultiple.mock.calls[0][0]).toHaveLength(1);
  });

  it('treats thrown invocations as failures', async () => {
    state.invoke.mockRejectedValue(new Error('ipc'));
    const { playAllStreams } = await load();
    await playAllStreams([item('a'), item('b')]);

    expect(state.ui.notify).toHaveBeenCalledWith(
      'warning',
      'youtube.playAll',
      'youtube.playAllFailures:{"count":2}'
    );
    expect(state.player.streamPending).toBeNull();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([]);
  });

  it('does not replay the current item and clears its pending marker', async () => {
    const { playAllStreams } = await load();
    state.player.currentTrack = { id: 'a', path: 'current' };
    state.player.streamPending = { id: 'a', path: 'pending' };
    await playAllStreams([item('a'), item('b')]);

    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.player.streamPending).toBeNull();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'b' })
    ]);
  });

  it('preserves a pending item chosen by the user', async () => {
    let resolveFirst: (value: any) => void = () => {};
    state.invoke.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    state.invoke.mockResolvedValue({ success: true, url: 'https://stream/x' });
    const { playAllStreams } = await load();
    const promise = playAllStreams([item('a'), item('b')]);
    await Promise.resolve();

    state.player.streamPending = { id: 'clicked', path: 'clicked' };
    resolveFirst({ success: true, url: 'https://stream/a' });
    await promise;

    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.player.streamPending).toEqual({ id: 'clicked', path: 'clicked' });
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' })
    ]);
  });

  it('does not override a local track chosen during resolution', async () => {
    let resolveFirst: (value: any) => void = () => {};
    state.invoke.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    const { playAllStreams } = await load();
    const promise = playAllStreams([item('a')]);
    await Promise.resolve();

    state.player.streamPending = null;
    state.player.currentTrack = { id: 'local', path: 'local' };
    resolveFirst({ success: true, url: 'https://stream/a' });
    await promise;

    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a' })
    ]);
  });

  it('filters already consumed history entries', async () => {
    const { playAllStreams } = await load();
    state.player.history = [{ path: 'path-1' }];
    await playAllStreams([item('a'), item('b'), item('c')]);
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'c' })
    ]);
  });

  it('limits concurrent resolution workers to four', async () => {
    let active = 0;
    let peak = 0;
    state.invoke.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { success: true, url: 'https://stream/x' };
    });
    const { playAllStreams } = await load();
    await playAllStreams(Array.from({ length: 10 }, (_, index) => item(`i${index}`)));
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('logs the starting item', async () => {
    const { playAllStreams } = await load();
    await playAllStreams([item('a')]);
    expect(state.info).toHaveBeenCalledWith('yt', 'playAllStreams start items=1 first=a');
  });
});
