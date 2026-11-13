import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  dispose: vi.fn()
}));

vi.mock('../listeners', () => ({
  createListenerScope: () => ({
    listen: (channel: string, fn: () => void) => {
      h.listeners.set(channel, fn);
      return () => h.listeners.delete(channel);
    },
    dispose: h.dispose
  })
}));

import { registerMediaIpcEvents } from '../registerMediaIpcEvents';

// Media keys / tray commands wired to the player store.

function fakePlayer() {
  return {
    volume: 0.5,
    togglePlay: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn()
  };
}

describe('registerMediaIpcEvents', () => {
  it('routes every media channel to the matching player action', () => {
    h.listeners.clear();
    const player = fakePlayer();

    const dispose = registerMediaIpcEvents(player as never);

    h.listeners.get('media:playPause')!();
    h.listeners.get('media:next')!();
    h.listeners.get('media:previous')!();
    h.listeners.get('media:stop')!();
    h.listeners.get('media:volumeUp')!();
    h.listeners.get('media:volumeDown')!();
    h.listeners.get('media:toggleMute')!();

    expect(player.togglePlay).toHaveBeenCalledTimes(1);
    expect(player.nextTrack).toHaveBeenCalledTimes(1);
    expect(player.prevTrack).toHaveBeenCalledTimes(1);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(0);
    expect(player.setVolume).toHaveBeenNthCalledWith(1, 0.55);
    expect(player.setVolume).toHaveBeenNthCalledWith(2, 0.45);
    expect(player.toggleMute).toHaveBeenCalledTimes(1);
    expect(dispose).toBe(h.dispose);
    expect([...h.listeners.keys()]).toEqual([
      'media:playPause',
      'media:next',
      'media:previous',
      'media:stop',
      'media:volumeUp',
      'media:volumeDown',
      'media:toggleMute'
    ]);
  });

  it('subtracts volume from the current level without clamping', () => {
    h.listeners.clear();
    const player = fakePlayer();
    player.volume = 0.05;

    registerMediaIpcEvents(player as never);
    h.listeners.get('media:volumeDown')!();

    expect(player.setVolume).toHaveBeenCalledWith(0);
  });
});
