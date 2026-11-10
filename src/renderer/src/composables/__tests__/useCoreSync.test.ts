import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, type EffectScope } from 'vue';

const h = vi.hoisted(() => ({
  init: vi.fn(),
  player: {
    recordExternalPlay: vi.fn(),
    currentTrack: null as unknown,
    queue: [] as unknown[],
    pendingQueue: [] as unknown[],
    history: [] as unknown[],
    isPlaying: false,
    shuffle: false,
    repeat: 'none',
    pipActive: false,
    pipTime: 0,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false
  },
  loggerInfo: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/core/coreClient', async () => {
  const { ref } = await import('vue');
  return { coreState: ref(null), initCoreClient: h.init };
});
vi.mock('@shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));

import { coreState } from '@renderer/core/coreClient';
import { useCoreSync } from '../useCoreSync';

function state(overrides: Record<string, unknown> = {}) {
  return {
    revision: 1,
    current: null,
    queue: [],
    pendingQueue: [],
    history: [],
    isPlaying: false,
    enginePlaying: false,
    shuffle: false,
    repeat: 'none',
    pipActive: false,
    pipTime: 0,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    ...overrides
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await nextTick();
}

let scope: EffectScope | null = null;

function run(): void {
  scope = effectScope();
  scope.run(() => useCoreSync());
}

beforeEach(() => {
  h.init.mockReset();
  h.player.recordExternalPlay.mockReset();
  h.player.currentTrack = null;
  h.player.queue = [];
  h.player.pendingQueue = [];
  h.player.history = [];
  h.player.isPlaying = false;
  h.player.shuffle = false;
  h.player.repeat = 'none';
  h.player.pipActive = false;
  h.player.pipTime = 0;
  h.player.currentTime = 0;
  h.player.duration = 0;
  h.player.volume = 1;
  h.player.isMuted = false;
  h.loggerInfo.mockReset();
  coreState.value = null;
  vi.restoreAllMocks();
});

afterEach(() => {
  scope?.stop();
  scope = null;
});

describe('useCoreSync', () => {
  it('initialises the Core client', () => {
    run();
    expect(h.init).toHaveBeenCalledTimes(1);
  });

  it('ignores an empty snapshot', async () => {
    run();
    coreState.value = null;
    await flush();

    expect(h.player.currentTrack).toBeNull();
    expect(h.loggerInfo).not.toHaveBeenCalled();
  });

  it('mirrors the snapshot into the player store', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    run();
    const track = { path: 'D:/a.mp3', name: 'A', type: 'audio' };

    coreState.value = state({
      current: track,
      queue: [{ path: 'D:/b.mp3' }],
      pendingQueue: [{ path: 'D:/c.mp3' }],
      history: [{ path: 'D:/d.mp3' }],
      isPlaying: true,
      enginePlaying: true,
      shuffle: true,
      repeat: 'all',
      pipActive: true,
      pipTime: 12,
      currentTime: 30,
      duration: 120,
      volume: 0.5,
      isMuted: true
    }) as never;
    await flush();

    expect(h.player.recordExternalPlay).toHaveBeenCalledWith(track);
    expect(h.player.currentTrack).toEqual(track);
    expect(h.player.queue).toEqual([{ path: 'D:/b.mp3' }]);
    expect(h.player.pendingQueue).toEqual([{ path: 'D:/c.mp3' }]);
    expect(h.player.history).toEqual([{ path: 'D:/d.mp3' }]);
    expect(h.player).toMatchObject({
      isPlaying: true,
      shuffle: true,
      repeat: 'all',
      pipActive: true,
      pipTime: 12,
      currentTime: 30,
      duration: 120,
      volume: 0.5,
      isMuted: true
    });
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'core-shell',
      expect.stringContaining('sync track=A intent=true engine=true time=30.0/120.0 queue=1')
    );
  });

  it('records external plays only when the track path changes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    run();
    const track = { path: 'D:/a.mp3', name: 'A', type: 'audio' };
    coreState.value = state({ current: track }) as never;
    await flush();
    coreState.value = state({ current: { ...track } }) as never;
    await flush();

    expect(h.player.recordExternalPlay).toHaveBeenCalledTimes(1);

    coreState.value = state({ current: { path: 'D:/b.mp3', name: 'B', type: 'audio' } }) as never;
    await flush();
    expect(h.player.recordExternalPlay).toHaveBeenCalledTimes(2);
  });

  it('throttles repeated logging for the same track', async () => {
    const now = vi.spyOn(Date, 'now');
    run();
    const track = { path: 'D:/a.mp3', name: 'A', type: 'audio' };

    now.mockReturnValue(10_000);
    coreState.value = state({ current: track }) as never;
    await flush();
    expect(h.loggerInfo).toHaveBeenCalledTimes(1);

    now.mockReturnValue(12_000);
    coreState.value = state({ current: track, currentTime: 1 }) as never;
    await flush();
    expect(h.loggerInfo).toHaveBeenCalledTimes(1);

    now.mockReturnValue(15_000);
    coreState.value = state({ current: track, currentTime: 2 }) as never;
    await flush();
    expect(h.loggerInfo).toHaveBeenCalledTimes(2);
  });

  it('does not override engine fields for video tracks', async () => {
    run();
    coreState.value = state({
      current: { path: 'D:/v.mp4', name: 'V', type: 'video' },
      currentTime: 40,
      duration: 200,
      volume: 0.3,
      isMuted: true
    }) as never;
    await flush();

    expect(h.player.currentTrack).toMatchObject({ type: 'video' });
    expect(h.player.currentTime).toBe(0);
    expect(h.player.duration).toBe(0);
    expect(h.player.volume).toBe(1);
    expect(h.player.isMuted).toBe(false);
  });

  it('handles a snapshot without a current track', async () => {
    run();
    coreState.value = state({ currentTime: 5 }) as never;
    await flush();

    expect(h.player.recordExternalPlay).not.toHaveBeenCalled();
    expect(h.player.currentTrack).toBeNull();
    expect(h.player.currentTime).toBe(5);
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'core-shell',
      expect.stringContaining('sync track=none')
    );
  });
});
