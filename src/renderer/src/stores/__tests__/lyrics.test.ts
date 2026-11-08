import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  player: null as any,
  currentTime: null as any,
  seek: vi.fn(),
  getLyrics: vi.fn(),
  clampDelay: vi.fn((ms: number) => Math.max(-10000, Math.min(10000, Math.round(ms)))),
  clampFont: vi.fn((scale: number) => Math.max(0.5, Math.min(2, scale))),
  findLine: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('../player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({ currentTime: state.currentTime, seek: state.seek })
}));
vi.mock('@renderer/utils/lyrics', () => ({
  clampLyricsDelay: state.clampDelay,
  clampLyricsFontScale: state.clampFont,
  findActiveLyricsLine: state.findLine,
  LYRICS_DELAY_COARSE_MS: 1000,
  LYRICS_DELAY_STEP_MS: 100,
  LYRICS_FONT_STEP: 0.1
}));

async function loadStore() {
  const { useLyricsStore } = await import('../lyrics');
  return useLyricsStore();
}

function lines(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    text: `Line ${index}`,
    timeMs: (index + 1) * 1000
  }));
}

function lyrics(overrides: Record<string, unknown> = {}) {
  return { kind: 'synced', lines: lines(), ...overrides } as any;
}

function track(path = 'C:/music/a.mp3', type = 'audio') {
  return { path, type, name: 'a.mp3' } as any;
}

beforeEach(() => {
  setActivePinia(createPinia());
  state.player = reactive({ currentTrack: null });
  state.currentTime = ref(0);
  state.seek.mockReset();
  state.getLyrics.mockReset();
  state.getLyrics.mockResolvedValue(lyrics());
  state.clampDelay.mockClear();
  state.clampFont.mockClear();
  state.findLine.mockReset();
  state.findLine.mockReturnValue(1);
  (window as { api?: unknown }).api = { getLyrics: state.getLyrics };
});

describe('loading', () => {
  it('starts empty without a track', async () => {
    const store = await loadStore();
    expect(store.result).toMatchObject({ kind: 'none', lines: [] });
    expect(store.loading).toBe(false);
    expect(store.error).toBe('');
    expect(state.getLyrics).not.toHaveBeenCalled();
  });

  it('loads lyrics for audio tracks and toggles loading', async () => {
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.getLyrics).toHaveBeenCalledWith('C:/music/a.mp3');
    expect(store.result).toMatchObject({ kind: 'synced' });
    expect(store.loading).toBe(false);
  });

  it('resets for non-audio tracks', async () => {
    state.player.currentTrack = track('C:/video/a.mp4', 'video');
    const store = await loadStore();
    expect(store.result.kind).toBe('none');
    expect(state.getLyrics).not.toHaveBeenCalled();
  });

  it('skips reloading the same track with existing lyrics', async () => {
    await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    state.getLyrics.mockClear();

    state.player.currentTrack = track();
    await Promise.resolve();
    expect(state.getLyrics).not.toHaveBeenCalled();
  });

  it('reloads the same path after a previous empty result', async () => {
    state.getLyrics.mockResolvedValueOnce({ kind: 'none', lines: [] });
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.result.kind).toBe('none');

    state.getLyrics.mockClear();
    state.getLyrics.mockResolvedValueOnce(lyrics());
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.getLyrics).toHaveBeenCalledWith('C:/music/a.mp3');
  });

  it('ignores stale responses', async () => {
    const first = { resolve: null as any };
    const second = { resolve: null as any };
    state.getLyrics.mockImplementationOnce(
      () => new Promise((resolve) => (first.resolve = resolve))
    );
    const store = await loadStore();
    state.player.currentTrack = track('a');
    await Promise.resolve();

    state.getLyrics.mockImplementationOnce(
      () => new Promise((resolve) => (second.resolve = resolve))
    );
    state.player.currentTrack = track('b');
    await Promise.resolve();

    second.resolve(lyrics({ kind: 'line', lines: [lines()[0]] }));
    await Promise.resolve();
    expect(store.result.kind).toBe('line');

    first.resolve(lyrics({ kind: 'synced' }));
    await Promise.resolve();
    expect(store.result.kind).toBe('line');
    expect(store.loading).toBe(false);
  });

  it('reports failures and stores an empty result', async () => {
    state.getLyrics.mockRejectedValueOnce(new Error('ipc'));
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.result.kind).toBe('none');
    expect(store.error).toBe('lyrics.loadError');
    expect(store.loading).toBe(false);
  });

  it('treats null and missing bridges as empty lyrics', async () => {
    state.getLyrics.mockResolvedValueOnce(null);
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.result.kind).toBe('none');

    delete (window as { api?: unknown }).api;
    state.player.currentTrack = track('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(store.result.kind).toBe('none');
  });

  it('resets state and invalidates in-flight loads', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    state.getLyrics.mockImplementationOnce(() => new Promise((resolve) => (resolveLoad = resolve)));
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();

    store.reset();
    resolveLoad(lyrics());
    await Promise.resolve();
    expect(store.result.kind).toBe('none');
    expect(store.loading).toBe(false);
  });
});

describe('lines and active index', () => {
  it('returns lines untouched without an offset', async () => {
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.lines).toBe(store.result.lines);
  });

  it('applies and clamps offsets', async () => {
    state.getLyrics.mockResolvedValueOnce(
      lyrics({
        offsetMs: -500,
        lines: [
          { text: 'a', timeMs: 100 },
          { text: 'b', timeMs: 2000 }
        ]
      })
    );
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.lines.map((line) => line.timeMs)).toEqual([0, 1500]);
  });

  it('finds the active line only for synced lyrics', async () => {
    const store = await loadStore();
    state.currentTime.value = 2;
    expect(store.activeIndex).toBe(-1);

    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();
    state.findLine.mockReturnValue(1);
    expect(store.activeIndex).toBe(1);

    store.setDelay(250);
    expect(store.activeIndex).toBe(1);
    expect(state.findLine).toHaveBeenLastCalledWith(store.lines, 1750);
  });
});

describe('adjustments', () => {
  it('clamps and adjusts delays', async () => {
    const store = await loadStore();
    expect(store.setDelay(200)).toBe(200);
    expect(store.adjustDelay(300)).toBe(500);
    expect(store.resetDelay()).toBe(0);
    expect(store.setDelay(999999)).toBe(10000);

    state.clampDelay.mockReturnValueOnce(5000);
    expect(store.adjustDelay(123)).toBe(5000);
    expect(store.stepMs).toBe(100);
    expect(store.coarseMs).toBe(1000);
  });

  it('clamps and adjusts font scale', async () => {
    const store = await loadStore();
    expect(store.setFontScale(1.5)).toBe(1.5);
    expect(store.adjustFontScale(0.1)).toBeCloseTo(1.6);
    expect(store.setFontScale(9)).toBe(2);
    expect(store.fontStep).toBe(0.1);
  });

  it('seeks to the requested lyric line', async () => {
    const store = await loadStore();
    state.player.currentTrack = track();
    await Promise.resolve();
    await Promise.resolve();

    store.setDelay(250);
    store.seekToLine(0);
    expect(state.seek).toHaveBeenCalledWith(1.25);
    store.seekToLine(99);
    expect(state.seek).toHaveBeenCalledTimes(1);
  });
});
