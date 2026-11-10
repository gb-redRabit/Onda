import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  on: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn()
}));

async function load() {
  vi.resetModules();
  return import('../coreClient');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function full(overrides: Record<string, unknown> = {}) {
  return {
    revision: 1,
    current: null,
    queue: [],
    pendingQueue: [],
    history: [],
    volume: 1,
    isMuted: false,
    shuffle: false,
    repeat: 'none',
    pipActive: false,
    pipTime: 0,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    isPlaying: false,
    enginePlaying: false,
    isLoading: false,
    error: null,
    ...overrides
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.handlers = {};
  state.on.mockReset();
  state.on.mockImplementation((channel: string, handler: (...args: unknown[]) => void) => {
    state.handlers[channel] = handler;
  });
  state.send.mockReset();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(null);
  (window as unknown as { api?: unknown }).api = {
    on: state.on,
    send: state.send,
    invoke: state.invoke
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { api?: unknown }).api;
});

describe('initialisation', () => {
  it('subscribes once, hydrates and arms the safety timer', async () => {
    const core = await load();
    core.initCoreClient();
    core.initCoreClient();
    await flush();

    expect(state.on).toHaveBeenCalledTimes(3);
    expect(state.on.mock.calls.map(([channel]) => channel)).toEqual([
      'core:state',
      'core:tick',
      'core:ready'
    ]);
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke).toHaveBeenCalledWith('core:getState');
  });

  it('hydrates a snapshot from invoke', async () => {
    state.invoke.mockResolvedValueOnce(full({ revision: 3, volume: 0.4 }));
    const core = await load();
    core.initCoreClient();
    await flush();

    expect(core.coreState.value).toMatchObject({ revision: 3, volume: 0.4 });
  });

  it('swallows hydration failures', async () => {
    state.invoke.mockRejectedValueOnce(new Error('not ready'));
    const core = await load();
    core.initCoreClient();
    await flush();

    expect(core.coreState.value).toBeNull();
  });

  it('works without a preload bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const core = await load();

    expect(() => core.initCoreClient()).not.toThrow();
    core.sendCoreCommand({ type: 'play' } as never);
    await vi.advanceTimersByTimeAsync(5000);

    expect(state.send).not.toHaveBeenCalled();
  });
});

describe('state application', () => {
  it('ignores non-object payloads', async () => {
    const core = await load();
    core.initCoreClient();
    await flush();

    for (const payload of [null, 'state', 42, undefined]) {
      state.handlers['core:state'](payload);
      state.handlers['core:tick'](payload);
    }

    expect(core.coreState.value).toBeNull();
  });

  it('replaces the snapshot on a full state', async () => {
    const core = await load();
    core.initCoreClient();

    state.handlers['core:state'](full({ revision: 2, volume: 0.3 }));

    expect(core.coreState.value).toMatchObject({ revision: 2, volume: 0.3 });
  });

  it('merges ticks into the previous snapshot', async () => {
    const core = await load();
    core.initCoreClient();
    state.handlers['core:state'](full({ revision: 1, queue: [{ id: 'a' }] }));

    state.handlers['core:tick']({ revision: 2, currentTime: 9 });

    expect(core.coreState.value).toMatchObject({
      revision: 2,
      currentTime: 9,
      queue: [{ id: 'a' }]
    });
  });

  it('ignores ticks without a snapshot', async () => {
    const core = await load();
    core.initCoreClient();

    state.handlers['core:tick']({ revision: 2, currentTime: 9 });

    expect(core.coreState.value).toBeNull();
  });

  it('drops stale revisions for both frames and ticks', async () => {
    const core = await load();
    core.initCoreClient();
    state.handlers['core:state'](full({ revision: 5, volume: 0.5 }));

    state.handlers['core:state'](full({ revision: 4, volume: 0.1 }));
    state.handlers['core:tick']({ revision: 3, volume: 0.2 });

    expect(core.coreState.value).toMatchObject({ revision: 5, volume: 0.5 });
  });

  it('resets and rehydrates on core:ready', async () => {
    const core = await load();
    state.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(full({ revision: 7 }));
    core.initCoreClient();
    await flush();
    state.handlers['core:state'](full({ revision: 9 }));

    state.handlers['core:ready']();
    expect(core.coreState.value).toBeNull();

    await flush();
    expect(core.coreState.value).toMatchObject({ revision: 7 });
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('commands', () => {
  it('queues commands until ready and flushes them in order', async () => {
    const core = await load();
    core.initCoreClient();

    core.sendCoreCommand({ type: 'play' } as never);
    core.sendCoreCommand({ type: 'pause' } as never);
    expect(state.send).not.toHaveBeenCalled();

    state.handlers['core:ready']();
    await flush();

    const sent = state.send.mock.calls.filter(([channel]) => channel === 'core:command');
    expect(sent.map(([, command]) => command)).toEqual([{ type: 'play' }, { type: 'pause' }]);
  });

  it('caps the pending queue and drops the oldest command', async () => {
    const core = await load();
    core.initCoreClient();

    for (let i = 0; i < 101; i += 1) {
      core.sendCoreCommand({ type: 'play', index: i } as never);
    }
    await vi.advanceTimersByTimeAsync(5000);

    const sent = state.send.mock.calls
      .filter(([channel]) => channel === 'core:command')
      .map(([, command]) => command as unknown as { index: number });
    expect(sent).toHaveLength(100);
    expect(sent[0].index).toBe(1);
    expect(sent.at(-1)?.index).toBe(100);
  });

  it('sends immediately once ready', async () => {
    const core = await load();
    core.initCoreClient();
    await vi.advanceTimersByTimeAsync(5000);

    core.sendCoreCommand({ type: 'next' } as never);

    expect(state.send).toHaveBeenCalledWith('core:command', { type: 'next' });
  });

  it('marks ready on the first applied frame', async () => {
    const core = await load();
    core.initCoreClient();
    core.sendCoreCommand({ type: 'play' } as never);

    state.handlers['core:state'](full({ revision: 1 }));

    expect(state.send).toHaveBeenCalledWith('core:command', { type: 'play' });
  });
});
