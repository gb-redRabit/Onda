import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { usePiP } from '@renderer/composables/usePiP';
import type { MediaFile } from '@renderer/types/media';
import { preparePiPSubtitleData } from '@renderer/composables/useSubtitleRenderer';
export function useVideoPiP(
  player: ReturnType<typeof usePlayerStore>,
  settings: ReturnType<typeof useSettingsStore>,
  pip: ReturnType<typeof usePiP>,
  getVideoRef: () => HTMLVideoElement | null,
  getSrc: (track: { path: string }) => string,
  syncSubtitlesWithPiP: () => void
) {
  async function togglePiP() {
    if (player.pipActive) {
      pip.stop();
      return;
    }

    const videoRef = getVideoRef();
    let src = videoRef?.src || '';
    if (!src && player.currentTrack) {
      src = getSrc(player.currentTrack);
    }
    if (!src) return;

    const startTime = videoRef?.currentTime || player.currentTime;

    const started = await pip.start(src, {
      position: settings.playback.pipPosition,
      width: settings.playback.pipWidth,
      height: settings.playback.pipHeight,
      startTime,
      subtitle: true
    });
    if (started) {
      player.pipTime = startTime;
      player.pipActive = true;
      videoRef?.pause();
      player.isPlaying = false;
      syncSubtitlesWithPiP();
    }
  }

  async function updatePiPSubtitles(track: MediaFile, guardPipActive = false): Promise<void> {
    await preparePiPSubtitleData(track.path)
      .then((subtitleData) => {
        if (guardPipActive && !player.pipActive) return;
        pip.updateSubtitle(subtitleData);
      })
      .catch(() => {});
  }

  return { togglePiP, updatePiPSubtitles };
}