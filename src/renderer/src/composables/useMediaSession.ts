import { watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { audioEngine } from '@renderer/modules/audioEngine';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import { currentTime, duration } from '@renderer/composables/useAudioPlayer';

// Media Session: metadane, kontrolki systemowe i pozycja dla ekranu blokady,
// klawiszy mediów i Bluetooth. W trybie Core-shell oba shelle żyją równolegle,
// więc tylko aktywny shell może rejestrować handlery — inaczej OS może wysłać
// komendę do ukrytego okna, którego store jest zamrożony, a Core ją odrzuci.
export interface MediaSessionControls {
  dispose: () => void;
}

export function useMediaSession(): MediaSessionControls {
  const player = usePlayerStore();

  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return { dispose: () => {} };
  }

  const session = navigator.mediaSession;
  const ACTION_HANDLERS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as const;

  let active = false;
  let stopActiveListener: (() => void) | null = null;
  let lastPositionSecond = -1;

  function clearHandlers(): void {
    for (const action of ACTION_HANDLERS) {
      try {
        session.setActionHandler(action, null);
      } catch {
        /* środowisko może nie wspierać danego handlera */
      }
    }
  }

  function registerHandlers(): void {
    try {
      session.setActionHandler('play', () => player.play());
      session.setActionHandler('pause', () => player.pause());
      session.setActionHandler('previoustrack', () => player.prevTrack());
      session.setActionHandler('nexttrack', () => player.nextTrack());
      session.setActionHandler('seekto', (details) => {
        if (!active || details.seekTime == null) return;
        const time = details.seekTime;
        // `player.seek` aktualizuje store — element trzeba przewinąć jawnie.
        player.seek(time);
        if (!isCoreShell()) {
          const media = audioEngine.getMediaElement();
          if (media) media.currentTime = time;
        }
        const video = document.querySelector('video');
        if (video) video.currentTime = time;
      });
    } catch {
      /* niektóre środowiska ograniczają handlery akcji */
    }
  }

  function updateMetadata(): void {
    if (!active) return;
    const track = player.currentTrack;
    if (!track) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: track.metadata?.title || track.name,
      artist: track.metadata?.artist || '',
      album: track.metadata?.album || '',
      ...(track.thumbnail ? { artwork: [{ src: track.thumbnail }] } : {})
    });
  }

  async function updateArtwork(path: string): Promise<void> {
    if (!active || /^https?:\/\//i.test(path) || path.startsWith('//')) return;
    try {
      const cover = await window.api?.getCover(path);
      if (!active || player.currentTrack?.path !== path) return;
      if (cover?.type === 'image' && cover.data && session.metadata) {
        session.metadata.artwork = [{ src: cover.data }];
      }
    } catch {
      /* grafika niedostępna */
    }
  }

  function updatePosition(force = false): void {
    if (!active) return;
    const total = duration.value;
    if (!Number.isFinite(total) || total <= 0) return;
    const second = Math.floor(currentTime.value);
    if (!force && second === lastPositionSecond) return;
    lastPositionSecond = second;
    try {
      session.setPositionState({
        duration: total,
        position: Math.max(0, Math.min(currentTime.value, total)),
        playbackRate: 1
      });
    } catch {
      /* pozycja może być chwilowo niepoprawna (np. brak duration) */
    }
  }

  function setActive(next: boolean): void {
    if (next === active) {
      if (next) updatePosition(true);
      return;
    }
    active = next;
    if (!active) {
      clearHandlers();
      try {
        session.metadata = null;
        session.playbackState = 'none';
        session.setPositionState();
      } catch {
        /* czyszczenie best-effort */
      }
      lastPositionSecond = -1;
      return;
    }

    registerHandlers();
    updateMetadata();
    session.playbackState = player.isPlaying ? 'playing' : 'paused';
    const track = player.currentTrack;
    if (track) void updateArtwork(track.path);
    updatePosition(true);
  }

  watch(
    () => player.currentTrack,
    (track) => {
      if (!active) return;
      updateMetadata();
      session.playbackState = player.isPlaying ? 'playing' : 'paused';
      if (track) void updateArtwork(track.path);
      updatePosition(true);
    },
    { immediate: true }
  );

  watch(
    () => player.isPlaying,
    (playing) => {
      if (!active) return;
      session.playbackState = playing ? 'playing' : 'paused';
      updatePosition(true);
    }
  );

  watch([currentTime, duration], () => updatePosition());

  if (window.api) {
    void window.api
      .invoke('app:getShellActive')
      .then((isActive) => setActive(isActive === true))
      .catch(() => setActive(true));
    stopActiveListener = window.api.on('app:shellActive', (isActive: unknown) => {
      setActive(isActive === true);
    });
  } else {
    setActive(true);
  }

  return {
    dispose: () => {
      stopActiveListener?.();
      stopActiveListener = null;
      setActive(false);
    }
  };
}
