import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  coreShell: false,
  player: null as any,
  engine: {
    resumeContext: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    deactivate: vi.fn(async () => undefined),
    savePosition: vi.fn(),
    destroy: vi.fn(async () => undefined)
  }
}));

vi.mock('../audioEngine', () => ({ audioEngine: h.engine }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => h.coreShell }));

import { PlayerModule } from '../PlayerModule';
import type { MediaFile } from '@renderer/types/media';

function track(type: 'audio' | 'video'): MediaFile {
  return {
    id: type,
    name: type,
    path: `D:/${type}`,
    extension: type,
    mimeType: '',
    size: 0,
    type,
    addedAt: 0,
    playCount: 0
  };
}

beforeEach(() => {
  h.coreShell = false;
  h.player = { currentTrack: null, isPlaying: false };
  for (const fn of Object.values(h.engine)) {
    if (typeof fn === 'function' && 'mockClear' in fn) (fn as any).mockClear();
  }
});

describe('activation', () => {
  it('does nothing audio-related in core shell mode', () => {
    h.coreShell = true;
    const module = new PlayerModule();

    module.activate({ track: track('audio') });

    expect(module.isActive()).toBe(true);
    expect(h.engine.resumeContext).not.toHaveBeenCalled();
  });

  it('resumes the context without a track', () => {
    const module = new PlayerModule();

    module.activate();

    expect(h.engine.resumeContext).toHaveBeenCalled();
    expect(h.engine.play).not.toHaveBeenCalled();
    expect(h.engine.pause).not.toHaveBeenCalled();
  });

  it('pauses when activating on a video from the context', () => {
    const module = new PlayerModule();

    module.activate({ track: track('video') });

    expect(h.engine.pause).toHaveBeenCalled();
    expect(h.engine.play).not.toHaveBeenCalled();
  });

  it('pauses for the current video track', () => {
    h.player.currentTrack = track('video');
    const module = new PlayerModule();

    module.activate({});

    expect(h.engine.pause).toHaveBeenCalled();
  });

  it('plays audio only when the player is already playing', () => {
    h.player.currentTrack = track('audio');
    h.player.isPlaying = true;
    const module = new PlayerModule();

    module.activate();

    expect(h.engine.play).toHaveBeenCalled();
  });

  it('does not start paused audio', () => {
    h.player.currentTrack = track('audio');
    h.player.isPlaying = false;
    const module = new PlayerModule();

    module.activate();

    expect(h.engine.play).not.toHaveBeenCalled();
    expect(h.engine.pause).not.toHaveBeenCalled();
  });

  it('exposes module identity and activity', () => {
    const module = new PlayerModule();
    expect(module.id).toBe('player');
    expect(module.name).toBe('Player');
    expect(module.isActive()).toBe(false);

    module.activate();
    expect(module.isActive()).toBe(true);
  });
});

describe('deactivation', () => {
  it('does nothing in core shell mode', async () => {
    h.coreShell = true;
    const module = new PlayerModule();
    module.activate();

    await module.deactivate();

    expect(module.isActive()).toBe(false);
    expect(h.engine.deactivate).not.toHaveBeenCalled();
    expect(h.engine.savePosition).not.toHaveBeenCalled();
  });

  it('deactivates video playback', async () => {
    h.player.currentTrack = track('video');
    const module = new PlayerModule();

    await module.deactivate();

    expect(h.engine.deactivate).toHaveBeenCalled();
    expect(h.engine.savePosition).not.toHaveBeenCalled();
  });

  it('saves the position for audio and empty players', async () => {
    const module = new PlayerModule();

    await module.deactivate();
    expect(h.engine.savePosition).toHaveBeenCalledTimes(1);

    h.player.currentTrack = track('audio');
    await module.deactivate();
    expect(h.engine.savePosition).toHaveBeenCalledTimes(2);
    expect(h.engine.deactivate).not.toHaveBeenCalled();
  });
});

describe('destroy', () => {
  it('skips engine teardown in core shell mode', async () => {
    h.coreShell = true;
    const module = new PlayerModule();
    module.activate();

    await module.destroy();

    expect(module.isActive()).toBe(false);
    expect(h.engine.destroy).not.toHaveBeenCalled();
  });

  it('destroys the engine in legacy mode', async () => {
    const module = new PlayerModule();
    module.activate();

    await module.destroy();

    expect(h.engine.destroy).toHaveBeenCalled();
    expect(module.isActive()).toBe(false);
  });
});
