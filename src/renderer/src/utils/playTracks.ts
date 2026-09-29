import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

// Plays a list of tracks as a fresh queue: the first one starts now, the rest
// wait in the queue. Same behaviour as the search palette's playlist action, so
// every "play this group" entry point (shelf, album, artist, playlist) matches.
export function playTrackList(tracks: readonly MediaFile[]): void {
  if (!tracks.length) return;
  const player = usePlayerStore();
  player.clearQueue();
  if (tracks.length > 1) player.addToQueueMultiple([...tracks.slice(1)]);
  player.setTrack(tracks[0]);
  player.play();
}
