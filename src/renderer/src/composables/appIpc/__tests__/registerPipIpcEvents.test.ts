import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  dispose: vi.fn()
}));

vi.mock('../listeners', () => ({
  createListenerScope: () => ({
    listen: (channel: string, handler: (...args: unknown[]) => void) => {
      h.handlers.set(channel, handler);
    },
    dispose: h.dispose
  })
}));

import { registerPipIpcEvents } from '../registerPipIpcEvents';

function player() {
  return {
    pipActive: true,
    pipTime: 12,
    currentTime: 0,
    isPlaying: false,
    pendingFullscreen: false,
    queueLength: 0,
    nextTrack: vi.fn()
  };
}

function router() {
  return { push: vi.fn() };
}

function emit(channel: string, ...args: unknown[]) {
  h.handlers.get(channel)!(...args);
}

beforeEach(() => {
  h.handlers.clear();
  h.dispose.mockClear();
});

describe('registration', () => {
  it('registers every PiP channel and returns dispose', () => {
    const close = registerPipIpcEvents(
      player() as never,
      router() as never,
      { name: 'home' } as never
    );

    expect([...h.handlers.keys()]).toEqual([
      'pip:closed',
      'pip:ended',
      'pip:maximize',
      'pip:restore'
    ]);
    expect(close).toBe(h.dispose);
  });
});

describe('pip:closed', () => {
  it('clears active state and time', () => {
    const p = player();
    registerPipIpcEvents(p as never, router() as never, { name: 'home' } as never);

    emit('pip:closed');

    expect(p.pipActive).toBe(false);
    expect(p.pipTime).toBe(0);
  });
});

describe('pip:ended', () => {
  it('advances the queue when something follows', () => {
    const p = player();
    p.queueLength = 2;
    registerPipIpcEvents(p as never, router() as never, { name: 'home' } as never);

    emit('pip:ended');

    expect(p.nextTrack).toHaveBeenCalledTimes(1);
  });

  it('stops PiP when the queue is empty', () => {
    const stop = vi.fn();
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ...window.api, pipStop: stop }
    });
    const p = player();
    registerPipIpcEvents(p as never, router() as never, { name: 'home' } as never);

    emit('pip:ended');

    expect(stop).toHaveBeenCalledTimes(1);
    expect(p.nextTrack).not.toHaveBeenCalled();
  });
});

describe('pip:maximize', () => {
  it('restores playback and navigates with requested fullscreen', () => {
    const p = player();
    const r = router();
    registerPipIpcEvents(p as never, r as never, { name: 'home' } as never);

    emit('pip:maximize', 42);

    expect(p).toMatchObject({
      pipActive: false,
      pipTime: 0,
      currentTime: 42,
      isPlaying: true,
      pendingFullscreen: true
    });
    expect(r.push).toHaveBeenCalledWith('/player');
  });

  it('defaults a missing time to zero', () => {
    const p = player();
    registerPipIpcEvents(p as never, router() as never, { name: 'home' } as never);

    emit('pip:maximize', undefined);

    expect(p.currentTime).toBe(0);
  });

  it('does not navigate or request fullscreen on the player route', () => {
    const p = player();
    p.pendingFullscreen = false;
    const r = router();
    registerPipIpcEvents(p as never, r as never, { name: 'player' } as never);

    emit('pip:maximize', 5);

    expect(r.push).not.toHaveBeenCalled();
    expect(p.pendingFullscreen).toBe(false);
    expect(p.currentTime).toBe(5);
  });
});

describe('pip:restore', () => {
  it('restores playback without fullscreen and navigates home route', () => {
    const p = player();
    const r = router();
    registerPipIpcEvents(p as never, r as never, { name: 'home' } as never);

    emit('pip:restore', 30);

    expect(p).toMatchObject({
      pipActive: false,
      pipTime: 0,
      currentTime: 30,
      isPlaying: true,
      pendingFullscreen: false
    });
    expect(r.push).toHaveBeenCalledWith('/player');
  });

  it('stays put when already on the player route', () => {
    const p = player();
    const r = router();
    registerPipIpcEvents(p as never, r as never, { name: 'player' } as never);

    emit('pip:restore');

    expect(r.push).not.toHaveBeenCalled();
    expect(p.currentTime).toBe(0);
  });
});
