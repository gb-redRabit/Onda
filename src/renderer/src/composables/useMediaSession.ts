import { watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';

// Basic Media Session integration: exposes metadata and play/pause/seek
// controls to the OS (lock screen, media keys, Bluetooth controls).
export function useMediaSession(): void {
  const player = usePlayerStore();

  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  function updateMetadata(): void {
    const track = player.currentTrack;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.metadata?.title || track.name,
      artist: track.metadata?.artist || '',
      album: track.metadata?.album || '',
      ...(track.thumbnail ? { artwork: [{ src: track.thumbnail }] } : {})
    });
  }

  async function updateArtwork(path: string): Promise<void> {
    // Stream/radio tracks use remote http(s) URLs as their path — main rejects
    // them on media:getCover ("unsafe path"). Their artwork is already set via
    // track.thumbnail in MediaMetadata, so skip the IPC round-trip entirely.
    if (/^https?:\/\//i.test(path) || path.startsWith('//')) return;
    try {
      const cover = await window.api?.getCover(path);
      if (cover?.type === 'image' && cover.data && navigator.mediaSession.metadata) {
        navigator.mediaSession.metadata.artwork = [{ src: cover.data }];
      }
    } catch {
      // artwork unavailable
    }
  }

  watch(
    () => player.currentTrack,
    (track) => {
      updateMetadata();
      navigator.mediaSession.playbackState = player.isPlaying ? 'playing' : 'paused';
      if (track) void updateArtwork(track.path);
    },
    { immediate: true }
  );

  watch(
    () => player.isPlaying,
    (playing) => {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  );

  try {
    navigator.mediaSession.setActionHandler('play', () => player.play());
    navigator.mediaSession.setActionHandler('pause', () => player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => player.prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => player.nextTrack());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) player.seek(details.seekTime);
    });
  } catch {
    // some environments restrict action handlers
  }
}
