import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regresja: `timeupdate` renderera woła `playback:setPosition` co ~3 s, a każdy zapis
// serializował cały JSON electron-store. Zapis jest teraz scalany (debounce) i
// opróżniany przy zamykaniu aplikacji.

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  stored: {} as Record<string, unknown>,
  setCalls: [] as Array<{ key: string; value: unknown }>
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, fn);
    }
  }
}));

vi.mock('../cover/cover-cache', () => ({
  getStore: async () => ({
    get: (key: string) => state.stored[key],
    set: (key: string, value: unknown) => {
      state.stored[key] = value;
      state.setCalls.push({ key, value });
    }
  })
}));

const { registerPlaybackHandlers, flushPlaybackPositions } = await import('../playback-handlers');

describe('playback position persistence', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.stored = {};
    state.setCalls.length = 0;
    registerPlaybackHandlers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid position updates into one store write', async () => {
    vi.useFakeTimers();
    const set = state.handlers.get('playback:setPosition')!;
    await set({}, '/a.mp3', 10);
    await set({}, '/a.mp3', 20);
    await set({}, '/a.mp3', 30);
    expect(state.setCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(state.setCalls).toHaveLength(1);
    const saved = state.stored['playbackPositions'] as Record<string, number>;
    expect(saved['/a.mp3']).toBe(30);
  });

  it('flushes pending positions before quit', async () => {
    const set = state.handlers.get('playback:setPosition')!;
    await set({}, '/b.mp3', 42);
    await flushPlaybackPositions();
    const saved = state.stored['playbackPositions'] as Record<string, number>;
    expect(saved['/b.mp3']).toBe(42);
  });
});
