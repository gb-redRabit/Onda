import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setPlayerShortcutCtx, handlePlayerShortcutKeydown } from '../playerShortcutHandler';

function keyPress(partial: Record<string, unknown> & { key?: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: '',
    bubbles: true,
    cancelable: true,
    ...(partial as KeyboardEventInit)
  });
}

function fire(
  partial: Record<string, unknown> & { key?: string },
  target?: HTMLElement
): KeyboardEvent {
  const e = keyPress(partial);
  (target ?? document.body).dispatchEvent(e);
  handlePlayerShortcutKeydown(e);
  return e;
}

const shortcuts: Record<string, string> = {
  'play-pause': 'Space',
  'skip-backward': 'ArrowLeft',
  'skip-forward': 'ArrowRight',
  'volume-up': 'ArrowUp',
  'volume-down': 'ArrowDown',
  mute: 'M',
  fullscreen: 'F',
  'speed-up': '>',
  'speed-down': '<',
  'jump-start': '0',
  'next-track': 'MediaTrackNext',
  'prev-track': 'MediaTrackPrevious'
};

function makeCtx() {
  const c = {
    player: {
      pipActive: false,
      volume: 0.5,
      isMuted: false,
      isPlaying: false,
      currentTime: 0,
      togglePlay: vi.fn(),
      toggleMute: vi.fn(),
      setVolume: vi.fn(),
      nextTrack: vi.fn(),
      prevTrack: vi.fn()
    },
    settings: {
      shortcuts,
      playback: { playbackSpeed: 1 }
    },
    getVideoRef: () => null as HTMLVideoElement | null,
    skip: vi.fn(),
    setSpeed: vi.fn(),
    toggleFullscreen: vi.fn(),
    notify: vi.fn(),
    t: (key: string) => key
  };
  return c;
}

describe('handlePlayerShortcutKeydown (app-level player shortcuts)', () => {
  beforeEach(() => {
    setPlayerShortcutCtx(null);
    document.body.dataset.shortcutRecording = '';
  });

  it('does nothing without a registered context', () => {
    const e = fire({ key: ' ' });
    expect(e.defaultPrevented).toBe(false);
  });

  it('toggles play on Space', () => {
    const c = makeCtx();
    c.player.togglePlay.mockImplementation(() => {
      c.player.isPlaying = !c.player.isPlaying;
    });
    setPlayerShortcutCtx(c);
    const e = fire({ key: ' ' });
    expect(e.defaultPrevented).toBe(true);
    expect(c.player.togglePlay).toHaveBeenCalledOnce();
  });

  it('skips -10 on ArrowLeft and -30 with Shift', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    fire({ key: 'ArrowLeft' });
    expect(c.skip).toHaveBeenLastCalledWith(-10);
    fire({ key: 'ArrowLeft', shiftKey: true });
    expect(c.skip).toHaveBeenLastCalledWith(-30);
  });

  it('skips +30 with Shift+ArrowRight (loose Shift match)', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    fire({ key: 'ArrowRight', shiftKey: true });
    expect(c.skip).toHaveBeenCalledWith(30);
  });

  it('changes volume on arrows', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    fire({ key: 'ArrowUp' });
    expect(c.player.setVolume).toHaveBeenCalledWith(0.55);
    fire({ key: 'ArrowDown' });
    expect(c.player.setVolume).toHaveBeenLastCalledWith(0.45);
  });

  it('mutes on M and fullscreens on F', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    fire({ key: 'm' });
    expect(c.player.toggleMute).toHaveBeenCalledOnce();
    fire({ key: 'f' });
    expect(c.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it('adjusts speed for >/< and jumps to start for 0', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    fire({ key: '>', shiftKey: true });
    expect(c.setSpeed).toHaveBeenCalledWith(1.25);
    fire({ key: '<', shiftKey: true });
    expect(c.setSpeed).toHaveBeenLastCalledWith(0.75);
    const e = fire({ key: '0' });
    expect(e.defaultPrevented).toBe(true);
    expect(c.player.currentTime).toBe(0);
  });

  it('navigates tracks with media keys', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    fire({ key: 'MediaTrackNext' });
    expect(c.player.nextTrack).toHaveBeenCalledOnce();
    fire({ key: 'MediaTrackPrevious' });
    expect(c.player.prevTrack).toHaveBeenCalledOnce();
  });

  it('ignores keys while a shortcut is being recorded', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    document.body.dataset.shortcutRecording = 'true';
    const e = fire({ key: ' ' });
    expect(e.defaultPrevented).toBe(false);
    expect(c.player.togglePlay).not.toHaveBeenCalled();
  });

  it('ignores keys typed into an input', () => {
    const c = makeCtx();
    setPlayerShortcutCtx(c);
    const input = document.createElement('input');
    const e = fire({ key: ' ' }, input);
    expect(e.target).toBe(input);
    expect(e.defaultPrevented).toBe(false);
    expect(c.player.togglePlay).not.toHaveBeenCalled();
  });
});
