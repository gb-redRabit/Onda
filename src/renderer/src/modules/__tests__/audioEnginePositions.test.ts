import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESUME_MIN_SECONDS } from '@shared/constants';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@shared/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { AudioEnginePositions } from '../audioEnginePositions';

type Api = {
  setPlaybackPosition?: (path: string, position: number) => Promise<void>;
  clearPlaybackPosition?: (path: string) => Promise<void>;
  getPlaybackPosition?: (path: string) => Promise<number>;
  invoke: ReturnType<typeof vi.fn>;
};

const api: Api = { invoke: vi.fn() };

function installApi(over: Partial<Api> = {}): void {
  Object.assign(api, {
    setPlaybackPosition: undefined,
    clearPlaybackPosition: undefined,
    getPlaybackPosition: undefined,
    ...over
  });
  (window as unknown as { api: Api }).api = api;
}

beforeEach(() => {
  api.invoke.mockReset().mockResolvedValue(undefined);
  warn.mockClear();
  installApi();
});

describe('AudioEnginePositions session map', () => {
  it('returns zero for unknown paths and remembers values', () => {
    const positions = new AudioEnginePositions();
    expect(positions.get('/a.mp3')).toBe(0);

    installApi({ setPlaybackPosition: vi.fn(async () => {}) });
    positions.persist('/a.mp3', 42);

    expect(positions.get('/a.mp3')).toBe(42);
    expect(api.setPlaybackPosition).toHaveBeenCalledWith('/a.mp3', 42);
  });

  it('ignores positions at or below the resume threshold', () => {
    const positions = new AudioEnginePositions();
    positions.persist('/a.mp3', RESUME_MIN_SECONDS);

    expect(positions.get('/a.mp3')).toBe(0);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it('falls back to an invoke channel when the preload helper is missing', () => {
    const positions = new AudioEnginePositions();
    positions.persist('/a.mp3', RESUME_MIN_SECONDS + 5);

    expect(api.invoke).toHaveBeenCalledWith(
      'playback:setPosition',
      '/a.mp3',
      RESUME_MIN_SECONDS + 5
    );
  });

  it('clears a single position through the helper or the invoke fallback', () => {
    const positions = new AudioEnginePositions();
    positions.persist('/a.mp3', 30);
    expect(positions.get('/a.mp3')).toBe(30);

    positions.clear('/a.mp3');
    expect(positions.get('/a.mp3')).toBe(0);
    expect(api.invoke).toHaveBeenCalledWith('playback:clearPosition', '/a.mp3');

    const clear = vi.fn(async () => {});
    installApi({ clearPlaybackPosition: clear });
    positions.persist('/b.mp3', 30);
    positions.clear('/b.mp3');
    expect(clear).toHaveBeenCalledWith('/b.mp3');
  });

  it('clears every in-memory position', () => {
    const positions = new AudioEnginePositions();
    positions.persist('/a.mp3', 30);
    positions.persist('/b.mp3', 40);

    positions.clearAll();

    expect(positions.get('/a.mp3')).toBe(0);
    expect(positions.get('/b.mp3')).toBe(0);
  });
});

describe('AudioEnginePositions restore', () => {
  it('reads a saved position from the main process and caches it', async () => {
    const get = vi.fn(async () => 77);
    installApi({ getPlaybackPosition: get });
    const positions = new AudioEnginePositions();

    await expect(positions.restore('/a.mp3')).resolves.toBe(77);
    expect(positions.get('/a.mp3')).toBe(77);
    expect(get).toHaveBeenCalledWith('/a.mp3');
  });

  it('does not cache a zero position', async () => {
    installApi({ getPlaybackPosition: async () => 0 });
    const positions = new AudioEnginePositions();

    await expect(positions.restore('/a.mp3')).resolves.toBe(0);
    expect(positions.get('/a.mp3')).toBe(0);
  });

  it('returns zero and logs when the bridge fails', async () => {
    installApi({ getPlaybackPosition: vi.fn(async () => Promise.reject(new Error('locked'))) });
    const positions = new AudioEnginePositions();

    await expect(positions.restore('/a.mp3')).resolves.toBe(0);
    expect(warn).toHaveBeenCalledWith('audio', 'restore saved position failed', expect.any(Error));
  });
});
