import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioPipRuntime } from '../audioPipRuntime';

const state = vi.hoisted(() => ({
  layout: vi.fn(),
  bins: vi.fn(),
  setVizActive: vi.fn(),
  audioPipUpdate: vi.fn(),
  send: vi.fn()
}));

vi.mock('../audioPipState', () => ({
  createEmptyAudioPipState: () => ({ id: 'empty' }),
  getFrequencyBins: state.bins,
  resolveAudioPipLayoutOpts: state.layout
}));
vi.mock('../useAudioPlayer', () => ({
  useAudioPlayer: () => ({ setVizActive: state.setVizActive })
}));

function pipState(overrides: Record<string, unknown> = {}) {
  return {
    id: 'state',
    coverData: 'cover-1',
    position: 10,
    ...overrides
  } as any;
}

function setup(overrides: Record<string, unknown> = {}) {
  const opts = {
    isActive: vi.fn(() => true),
    getState: vi.fn(() => pipState()),
    ...overrides
  };
  return { runtime: createAudioPipRuntime(opts as never), opts };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.layout.mockReset();
  state.layout.mockReturnValue({ dock: 'right', edgeElements: ['viz'], cornerElements: [] });
  state.bins.mockReset();
  state.bins.mockReturnValue([1, 2, 3]);
  state.setVizActive.mockReset();
  state.audioPipUpdate.mockReset();
  state.send.mockReset();
  (window as { api?: unknown }).api = {
    audioPipUpdate: state.audioPipUpdate,
    send: state.send
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { api?: unknown }).api;
});

describe('state updates', () => {
  it('sends a copy with the current layout options', () => {
    const { runtime } = setup();
    const value = pipState();
    runtime.sendUpdate(value);
    expect(state.audioPipUpdate).toHaveBeenCalledWith(value, {
      dock: 'right',
      edgeElements: ['viz'],
      cornerElements: []
    });
  });

  it('stores a snapshot without sending it', () => {
    const { runtime } = setup();
    runtime.setLastState(pipState({ coverData: 'cover-x' }));
    expect(state.audioPipUpdate).not.toHaveBeenCalled();
  });

  it('tolerates a missing preload bridge', () => {
    delete (window as { api?: unknown }).api;
    const { runtime } = setup();
    expect(() => runtime.sendUpdate(pipState())).not.toThrow();
  });
});

describe('viz layout detection', () => {
  function vizEnabledFor(layout: unknown): boolean {
    state.layout.mockReturnValue(layout);
    state.setVizActive.mockClear();
    const { runtime } = setup();
    runtime.startVizTracking();
    const enabled = state.setVizActive.mock.calls.some((call) => call[0] === true);
    runtime.stopAll();
    return enabled;
  }

  it('uses edge elements for every dock', () => {
    expect(vizEnabledFor({ dock: 'top', edgeElements: ['viz'], cornerElements: [] })).toBe(true);
    expect(vizEnabledFor({ dock: 'bottom', edgeElements: ['viz'], cornerElements: [] })).toBe(true);
    expect(vizEnabledFor({ dock: 'left', edgeElements: ['viz'], cornerElements: [] })).toBe(true);
    expect(vizEnabledFor({ dock: 'right', edgeElements: ['viz'], cornerElements: [] })).toBe(true);
  });

  it('uses corner elements for floating mode', () => {
    expect(vizEnabledFor({ dock: 'corner', edgeElements: [], cornerElements: ['viz'] })).toBe(true);
    expect(vizEnabledFor({ dock: 'corner', edgeElements: ['viz'], cornerElements: [] })).toBe(
      false
    );
  });

  it('treats layout failures as disabled', () => {
    state.layout.mockImplementation(() => {
      throw new Error('no settings');
    });
    const { runtime } = setup();
    runtime.startVizTracking();
    expect(state.setVizActive).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });
});

describe('viz tracking', () => {
  it('subscribes once and streams frequency bins', () => {
    const { runtime } = setup();
    runtime.startVizTracking();
    expect(state.setVizActive).toHaveBeenCalledWith(true);

    vi.advanceTimersByTime(100);
    expect(state.send).toHaveBeenCalledWith('audio-pip:vizData', [1, 2, 3]);

    runtime.stopVizTracking();
    expect(state.setVizActive).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(300);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it('does not resubscribe while already tracking', () => {
    const { runtime } = setup();
    runtime.startVizTracking();
    runtime.startVizTracking();
    expect(state.setVizActive).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes immediately when viz is disabled', () => {
    const { runtime } = setup();
    runtime.startVizTracking();
    expect(state.setVizActive).toHaveBeenCalledWith(true);

    state.layout.mockReturnValue({ dock: 'right', edgeElements: [], cornerElements: [] });
    runtime.startVizTracking();
    expect(state.setVizActive).toHaveBeenLastCalledWith(false);

    runtime.startVizTracking();
    expect(state.setVizActive).toHaveBeenCalledTimes(2);
  });

  it('stops when the pip window becomes inactive', () => {
    const { runtime, opts } = setup();
    runtime.startVizTracking();
    opts.isActive.mockReturnValue(false);
    vi.advanceTimersByTime(100);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.setVizActive).toHaveBeenLastCalledWith(false);
  });

  it('stops when the layout disables viz while running', () => {
    const { runtime } = setup();
    runtime.startVizTracking();
    state.layout.mockReturnValue({ dock: 'right', edgeElements: [], cornerElements: [] });
    vi.advanceTimersByTime(100);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.setVizActive).toHaveBeenLastCalledWith(false);
  });

  it('ignores unsubscribe when never subscribed', () => {
    const { runtime } = setup();
    runtime.stopVizTracking();
    expect(state.setVizActive).not.toHaveBeenCalled();
  });
});

describe('time tracking', () => {
  it('sends a snapshot every 500ms', () => {
    const { runtime, opts } = setup();
    opts.getState.mockReturnValue(pipState({ position: 42 }));
    runtime.startTimeTracking();

    vi.advanceTimersByTime(500);
    expect(state.send).toHaveBeenCalledWith('audio-pip:timeUpdate', {
      id: 'state',
      coverData: 'cover-1',
      position: 42
    });

    vi.advanceTimersByTime(500);
    expect(state.send).toHaveBeenCalledTimes(2);
  });

  it('restarts cleanly and stops when inactive', () => {
    const { runtime, opts } = setup();
    runtime.startTimeTracking();
    runtime.startTimeTracking();
    vi.advanceTimersByTime(500);
    expect(state.send).toHaveBeenCalledTimes(1);

    opts.isActive.mockReturnValue(false);
    vi.advanceTimersByTime(500);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it('stops manually', () => {
    const { runtime } = setup();
    runtime.startTimeTracking();
    runtime.stopTimeTracking();
    vi.advanceTimersByTime(2000);
    expect(state.send).not.toHaveBeenCalled();
  });
});

describe('cover retry', () => {
  it('sends an update once a new cover appears', () => {
    const { runtime, opts } = setup();
    opts.getState.mockReturnValue(pipState({ coverData: 'cover-1' }));
    runtime.setLastState(pipState({ coverData: 'cover-1' }));
    runtime.startCoverRetry();

    vi.advanceTimersByTime(800);
    expect(state.audioPipUpdate).not.toHaveBeenCalled();

    opts.getState.mockReturnValue(pipState({ coverData: 'cover-2' }));
    vi.advanceTimersByTime(1600);
    expect(state.audioPipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ coverData: 'cover-2' }),
      expect.any(Object)
    );
    vi.advanceTimersByTime(10_000);
    expect(state.audioPipUpdate).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts', () => {
    const { runtime, opts } = setup();
    opts.getState.mockReturnValue(pipState({ coverData: 'same' }));
    runtime.setLastState(pipState({ coverData: 'same' }));
    runtime.startCoverRetry();

    vi.advanceTimersByTime(800);
    vi.advanceTimersByTime(1600);
    vi.advanceTimersByTime(2400);
    vi.advanceTimersByTime(20_000);
    expect(state.audioPipUpdate).not.toHaveBeenCalled();
  });

  it('skips work when the pip window is inactive', () => {
    const { runtime, opts } = setup();
    opts.isActive.mockReturnValue(false);
    runtime.startCoverRetry();
    vi.advanceTimersByTime(10_000);
    expect(opts.getState).not.toHaveBeenCalled();
  });

  it('restarts and clears pending timers', () => {
    const { runtime } = setup();
    runtime.startCoverRetry();
    runtime.startCoverRetry();
    runtime.stopCoverRetry();
    vi.advanceTimersByTime(10_000);
    expect(state.send).not.toHaveBeenCalled();
  });

  it('sends nothing when the cover stays empty', () => {
    const { runtime, opts } = setup();
    opts.getState.mockReturnValue(pipState({ coverData: undefined }));
    runtime.startCoverRetry();
    vi.advanceTimersByTime(10_000);
    expect(state.audioPipUpdate).not.toHaveBeenCalled();
  });
});

describe('stopAll', () => {
  it('stops time, viz and cover timers', () => {
    const { runtime, opts } = setup();
    opts.getState.mockReturnValue(pipState({ coverData: 'new' }));
    runtime.startTimeTracking();
    runtime.startVizTracking();
    runtime.startCoverRetry();

    runtime.stopAll();
    expect(state.setVizActive).toHaveBeenLastCalledWith(false);
    state.send.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.audioPipUpdate).not.toHaveBeenCalled();
  });
});
