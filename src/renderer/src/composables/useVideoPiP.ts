import { watch } from 'vue';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useSettingsStore } from '@renderer/stores/settings';
import type { usePiP } from '@renderer/composables/usePiP';
import type { MediaFile } from '@renderer/types/media';
import type { SubtitleData } from '@renderer/composables/subtitleState';
import { preparePiPSubtitleData } from '@renderer/composables/useSubtitleRenderer';
import { subtitleDelayMs } from '@renderer/composables/subtitleDelay';
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

    if (settings.playback.pipPreBuffer) {
      pip.preload(src, null);
    }

    const startTime = videoRef?.currentTime || player.currentTime;

    const started = await pip.start(src, {
      position: settings.playback.pipPosition,
      width: settings.playback.pipWidth,
      height: settings.playback.pipHeight,
      startTime,
      subtitle: true
    });
    if (started) {
      player.enterPiP(startTime);
      videoRef?.pause();
      syncSubtitlesWithPiP();
    }
  }

  let lastSubtitleData: SubtitleData | null = null;

  /** Dołącza bieżące opóźnienie napisów do payloadu PiP (okno stosuje je jako offset). */
  function sendSubtitle(data: SubtitleData | null): void {
    pip.updateSubtitle(data ? { ...data, subtitleDelayMs: subtitleDelayMs.value } : null);
  }

  async function updatePiPSubtitles(track: MediaFile, guardPipActive = false): Promise<void> {
    try {
      const subtitleData = await preparePiPSubtitleData(track.path);
      if (guardPipActive && !player.pipActive) return;
      lastSubtitleData = subtitleData;
      sendSubtitle(subtitleData);
    } catch {
      /* best-effort: brak napisów w PiP nie może przerwać odtwarzania */
    }
  }

  // Regulacja opóźnienia musi trafić do okna PiP bez ponownej ekstrakcji napisów.
  watch(subtitleDelayMs, () => {
    if (player.pipActive && lastSubtitleData) sendSubtitle(lastSubtitleData);
  });

  return { togglePiP, updatePiPSubtitles };
}
