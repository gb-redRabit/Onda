import type { usePlayerStore } from '@renderer/stores/player';
import { createListenerScope } from './listeners';

type PlayerStore = ReturnType<typeof usePlayerStore>;

// Globalne klawisze mediów / tray — podłączone do store odtwarzacza. Wydzielone
// z `useAppIpcEvents` (plan 2.8), aby domena odtwarzacza miała własny moduł.
export function registerMediaIpcEvents(player: PlayerStore): () => void {
  const { listen, dispose } = createListenerScope();

  listen('media:playPause', () => player.togglePlay());
  listen('media:next', () => player.nextTrack());
  listen('media:previous', () => player.prevTrack());
  listen('media:stop', () => {
    player.pause();
    player.seek(0);
  });
  listen('media:volumeUp', () => player.setVolume(player.volume + 0.05));
  listen('media:volumeDown', () => player.setVolume(player.volume - 0.05));
  listen('media:toggleMute', () => player.toggleMute());

  return dispose;
}
