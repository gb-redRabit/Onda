import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

// Odtwarza listę utworów jako świeżą kolejkę: pierwszy startuje teraz, reszta
// czeka w kolejce. To samo zachowanie co akcja playlisty w palecie wyszukiwania, więc
// każde miejsce "odtwórz tę grupę" (półka, album, wykonawca, playlista) działa tak samo.
export function playTrackList(tracks: readonly MediaFile[]): void {
  if (!tracks.length) return;
  const player = usePlayerStore();
  player.clearQueue();
  if (tracks.length > 1) player.addToQueueMultiple([...tracks.slice(1)]);
  player.setTrack(tracks[0]);
  player.play();
}
