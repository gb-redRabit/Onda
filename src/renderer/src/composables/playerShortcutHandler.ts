import { matchesShortcut } from '@renderer/utils/shortcuts';
import { applyVolumeTarget, seekTarget } from '@renderer/utils/mediaTransport';
import { getActivePinia } from 'pinia';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { useAudioPlayer } from './useAudioPlayer';
import { EQUALIZER_PRESETS, EQ_LIMITS, cloneEqBands } from '@renderer/utils/constants';
import {
  SUBTITLE_DELAY_STEP_MS,
  SUBTITLE_DELAY_COARSE_MS,
  adjustSubtitleDelay,
  resetSubtitleDelay,
  formatSubtitleDelay
} from './subtitleDelay';
import { i18n } from '@renderer/i18n';

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
 * Dostawca kontekstu dla widoku wideo (/player). Obsługa keydown na poziomie aplikacji
 * pozostaje zainstalowana przez cały czas życia aplikacji; to jedynie mówi, czy odtwarzacz
 * jest na ekranie i na czym działać, gdy skrót pasuje.
 */
export function setPlayerShortcutCtx(next: PlayerShortcutCtx | null): void {
  ctx = next;
}

function matches(action: string, e: KeyboardEvent): boolean {
  const c = ctx;
  if (!c) return false;
  const shortcut = c.settings.shortcuts[action];
  return !!shortcut && matchesShortcut(shortcut, e);
}

// Pomijanie akceptuje Shift jako dodatkowy modyfikator "±30s", więc surowy klawisz musi
// pasować nawet przy wciśniętym Shift (sam skrót nie zawiera Shift).
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

function abCurrentTime(): number {
  const video = ctx?.getVideoRef();
  if (video) return video.currentTime;
  return useAudioPlayer().currentTime.value;
}

/**
 * Skróty pętli A–B działają niezależnie od widoku (wideo i audio): czas bierzemy z elementu
 * wideo, gdy jest na ekranie, w przeciwnym razie z silnika audio.
 */
function handleAbShortcuts(e: KeyboardEvent): boolean {
  // Bez aktywnej instancji Pinia (np. w teście jednostkowym) nie ma skrótów do sprawdzenia.
  if (!getActivePinia()) return false;
  const shortcuts = useSettingsStore().shortcuts;
  const player = usePlayerStore();
  const a = shortcuts['ab-set-a'];
  if (a && matchesShortcut(a, e)) {
    e.preventDefault();
    player.setAbA(abCurrentTime());
    return true;
  }
  const b = shortcuts['ab-set-b'];
  if (b && matchesShortcut(b, e)) {
    e.preventDefault();
    player.setAbB(abCurrentTime());
    return true;
  }
  const clear = shortcuts['ab-clear'];
  if (clear && matchesShortcut(clear, e)) {
    e.preventDefault();
    player.clearAb();
    return true;
  }
  return false;
}

/**
 * Globalne skróty korektora (działają wszędzie): pokaż/ukryj, bypass, dodaj pasmo, reset,
 * snap, mono. Wartości edytowalne w Ustawieniach → Skróty.
 */
function handleEqShortcuts(e: KeyboardEvent): boolean {
  if (!getActivePinia()) return false;
  const shortcuts = useSettingsStore().shortcuts;
  const player = usePlayerStore();
  const audio = useAudioPlayer();

  const toggle = shortcuts['eq-toggle'];
  if (toggle && matchesShortcut(toggle, e)) {
    e.preventDefault();
    player.equalizerVisible = !player.equalizerVisible;
    return true;
  }
  const bypass = shortcuts['eq-bypass'];
  if (bypass && matchesShortcut(bypass, e)) {
    e.preventDefault();
    audio.setEqEnabled(!player.equalizerEnabled);
    return true;
  }
  const add = shortcuts['eq-add-band'];
  if (add && matchesShortcut(add, e)) {
    e.preventDefault();
    if (player.equalizerBands.length < EQ_LIMITS.maxBands) {
      const next = cloneEqBands(player.equalizerBands);
      next.push({ type: 'peaking', frequency: 1000, q: 1, gain: 0 });
      player.equalizerPreset = 'custom';
      audio.applyEqBands(next);
    }
    return true;
  }
  const reset = shortcuts['eq-reset'];
  if (reset && matchesShortcut(reset, e)) {
    e.preventDefault();
    player.equalizerPreset = 'flat';
    audio.applyEqBands(cloneEqBands(EQUALIZER_PRESETS.flat));
    return true;
  }
  const snap = shortcuts['eq-snap'];
  if (snap && matchesShortcut(snap, e)) {
    e.preventDefault();
    audio.setEqSnap(!player.equalizerSnap);
    return true;
  }
  const mono = shortcuts['eq-mono'];
  if (mono && matchesShortcut(mono, e)) {
    e.preventDefault();
    audio.setEqMono(!player.equalizerMono);
    return true;
  }
  return false;
}

/**
 * Dopasowanie z luźnym Shiftem: Shift jest dodatkowym modyfikatorem „krok gruby",
 * więc surowy klawisz musi pasować także przy wciśniętym Shift (sam skrót go nie zawiera).
 */
function matchesLooseShift(shortcut: string, e: KeyboardEvent): boolean {
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

function notifySubtitleDelay(ms: number): void {
  useUIStore().notify(
    'info',
    i18n.global.t('player.subtitleDelay', { delay: formatSubtitleDelay(ms) }),
    undefined,
    1400
  );
}

/**
 * Skróty przesunięcia napisów (Subtitle Delay / Offset). Krok 50 ms, Shift = 500 ms.
 * Dodatnia wartość = napisy później. Wartości edytowalne w Ustawieniach → Skróty.
 */
function handleSubtitleDelayShortcuts(e: KeyboardEvent): boolean {
  if (!getActivePinia()) return false;
  const shortcuts = useSettingsStore().shortcuts;
  const step = e.shiftKey ? SUBTITLE_DELAY_COARSE_MS : SUBTITLE_DELAY_STEP_MS;

  const down = shortcuts['subtitle-delay-down'];
  if (down && matchesLooseShift(down, e)) {
    e.preventDefault();
    notifySubtitleDelay(adjustSubtitleDelay(-step));
    return true;
  }
  const up = shortcuts['subtitle-delay-up'];
  if (up && matchesLooseShift(up, e)) {
    e.preventDefault();
    notifySubtitleDelay(adjustSubtitleDelay(step));
    return true;
  }
  const reset = shortcuts['subtitle-delay-reset'];
  if (reset && matchesLooseShift(reset, e)) {
    e.preventDefault();
    notifySubtitleDelay(resetSubtitleDelay());
    return true;
  }
  return false;
}

/**
 * Obsługuje skróty widoku odtwarzacza. Wywoływane z pojedynczego nasłuchu keydown
 * na poziomie App (zawsze zarejestrowanego, gdy okno jest aktywne), dzięki czemu klawisze
 * odtwarzania działają mimo ciągłego montowania/odmontowywania widoków.
 */
export function handlePlayerShortcutKeydown(e: KeyboardEvent): void {
  if (document.body.dataset.shortcutRecording) return;

  const target = e.target as HTMLElement | null;
  if (
    !target ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
    return;

  // Pętla A–B działa w wideo i audio, więc obsługujemy ją przed sprawdzeniem kontekstu widoku.
  if (handleAbShortcuts(e)) return;
  if (handleEqShortcuts(e)) return;
  if (handleSubtitleDelayShortcuts(e)) return;

  const c = ctx;
  if (!c) return;

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
