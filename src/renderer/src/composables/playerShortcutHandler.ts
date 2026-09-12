import { matchesShortcut } from '@renderer/utils/shortcuts';
import { applyVolumeTarget, seekTarget } from '@renderer/utils/mediaTransport';

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

interface PlayerShortcutCtx {
  player: {
    pipActive: boolean;
    volume: number;
    isMuted: boolean;
    isPlaying: boolean;
    currentTime: number;
    togglePlay: () => void;
    toggleMute: () => void;
    setVolume: (v: number) => void;
    nextTrack: () => void;
    prevTrack: () => void;
  };
  settings: {
    shortcuts: Record<string, string>;
    playback: {
      playbackSpeed: number;
    };
  };
  getVideoRef: () => HTMLVideoElement | null;
  skip: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  toggleFullscreen: () => void;
  notify: (text: string, duration?: number) => void;
  t: TranslateFn;
}

let ctx: PlayerShortcutCtx | null = null;

/**
 * Context provider for the video view (/player). App-level keydown handling
 * stays installed for the whole app lifetime; this only says whether a player
 * is on screen and what to act upon when a shortcut matches.
 */
export function setPlayerShortcutCtx(next: PlayerShortcutCtx | null): void {
  ctx = next;
}

export function hasPlayerShortcutCtx(): boolean {
  return ctx !== null;
}

function matches(action: string, e: KeyboardEvent): boolean {
  const c = ctx;
  if (!c) return false;
  const shortcut = c.settings.shortcuts[action];
  return !!shortcut && matchesShortcut(shortcut, e);
}

// Skip accepts Shift as a secondary "±30s" modifier, so the raw key must
// match even when Shift is held (the shortcut itself carries no Shift).
function matchesSkip(action: string, e: KeyboardEvent): boolean {
  const c = ctx;
  if (!c) return false;
  const shortcut = c.settings.shortcuts[action];
  if (!shortcut) return false;
  if (matchesShortcut(shortcut, e)) return true;
  return (
    e.shiftKey &&
    matchesShortcut(shortcut, {
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: false
    } as KeyboardEvent)
  );
}

function skipBy(e: KeyboardEvent, seconds: number, shiftSeconds: number): void {
  const c = ctx;
  if (!c) return;
  c.skip(e.shiftKey ? shiftSeconds : seconds);
}

function setTransportVolume(volume: number): void {
  const c = ctx;
  if (!c) return;
  applyVolumeTarget(c.getVideoRef(), c.player.isMuted, volume);
}

/**
 * Handles player-view shortcuts. Invoked from the single App-level keydown
 * listener (always registered while the window is focused) so playback keys
 * keep working across view mount/unmount churn.
 */
export function handlePlayerShortcutKeydown(e: KeyboardEvent): void {
  const c = ctx;
  if (!c) return;
  if (document.body.dataset.shortcutRecording) return;

  const target = e.target as HTMLElement | null;
  if (
    !target ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
    return;

  if (matches('play-pause', e)) {
    e.preventDefault();
    if (c.player.pipActive) return;
    c.player.togglePlay();
    c.notify(c.player.isPlaying ? c.t('player.playing') : c.t('player.paused'), 1000);
    return;
  }

  if (matchesSkip('skip-backward', e)) {
    e.preventDefault();
    skipBy(e, -10, -30);
    return;
  }

  if (matchesSkip('skip-forward', e)) {
    e.preventDefault();
    skipBy(e, 10, 30);
    return;
  }

  if (matches('volume-up', e)) {
    e.preventDefault();
    const newVol = Math.min(1, c.player.volume + 0.05);
    c.player.setVolume(newVol);
    setTransportVolume(newVol);
    c.notify(c.t('player.volume', { n: Math.round(newVol * 100) }), 1200);
    return;
  }

  if (matches('volume-down', e)) {
    e.preventDefault();
    const newVol = Math.max(0, c.player.volume - 0.05);
    c.player.setVolume(newVol);
    setTransportVolume(newVol);
    c.notify(c.t('player.volume', { n: Math.round(newVol * 100) }), 1200);
    return;
  }

  if (matches('mute', e)) {
    e.preventDefault();
    c.player.toggleMute();
    c.notify(
      c.player.isMuted
        ? c.t('player.muted')
        : c.t('player.volume', { n: Math.round(c.player.volume * 100) }),
      1200
    );
    return;
  }

  if (matches('fullscreen', e)) {
    e.preventDefault();
    c.toggleFullscreen();
    return;
  }

  if (matches('speed-down', e)) {
    e.preventDefault();
    c.setSpeed(c.settings.playback.playbackSpeed - 0.25);
    return;
  }

  if (matches('speed-up', e)) {
    e.preventDefault();
    c.setSpeed(c.settings.playback.playbackSpeed + 0.25);
    return;
  }

  if (matches('jump-start', e)) {
    e.preventDefault();
    seekTarget(c.getVideoRef(), 0);
    c.player.currentTime = 0;
    c.notify('0:00', 1000);
    return;
  }

  if (matches('prev-track', e)) {
    e.preventDefault();
    c.player.prevTrack();
    return;
  }

  if (matches('next-track', e)) {
    e.preventDefault();
    c.player.nextTrack();
    return;
  }
}
