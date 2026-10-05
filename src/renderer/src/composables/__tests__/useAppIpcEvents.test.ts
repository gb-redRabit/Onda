import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import { registerAppIpc } from '../useAppIpcEvents';
import type { usePlayerStore } from '@renderer/stores/player';

const originalApi = window.api;

type Handler = (...args: unknown[]) => void;

let handlers: Map<string, Handler>;
let unsubscribe: ReturnType<typeof vi.fn>;

function stubApi(): void {
  handlers = new Map();
  unsubscribe = vi.fn();
  window.api = Object.assign({}, originalApi, {
    on: (channel: string, cb: Handler) => {
      handlers.set(channel, cb);
      return unsubscribe;
    },
    invoke: vi.fn().mockResolvedValue(undefined),
    pipStop: vi.fn()
  }) as Window['api'];
}

function makeDeps() {
  const player = {
    togglePlay: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    volume: 1,
    queueLength: 0,
    pipActive: false,
    pipTime: 0,
    currentTime: 0,
    isPlaying: false,
    pendingFullscreen: false
  };
  return {
    player: player as unknown as ReturnType<typeof usePlayerStore>,
    router: { push: vi.fn() } as unknown as Router,
    route: { name: 'home' } as unknown as RouteLocationNormalizedLoaded
  };
}

beforeEach(stubApi);
afterEach(() => {
  window.api = originalApi;
});

describe('registerAppIpc', () => {
  it('registers every domain listener once and tears them all down', () => {
    const deps = makeDeps();
    const cleanup = registerAppIpc(deps);

    // Kompozycja czterech domen: media (7), PiP (4), eksplorator (3), system (1).
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'media:playPause',
        'media:next',
        'media:previous',
        'media:stop',
        'media:volumeUp',
        'media:volumeDown',
        'media:toggleMute',
        'pip:closed',
        'pip:ended',
        'pip:maximize',
        'pip:restore',
        'explorer:add-tab',
        'explorer:refresh',
        'explorer:remove-tab',
        'open-files'
      ])
    );
    expect(handlers.size).toBe(15);

    handlers.get('media:playPause')!();
    expect(deps.player.togglePlay).toHaveBeenCalledTimes(1);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(15);
  });
});
