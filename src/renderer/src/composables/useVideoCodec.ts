import { audioEngine } from '@renderer/modules/audioEngine';
import type { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';
import { i18n } from '@renderer/i18n';

interface VideoCodecContext {
  player: ReturnType<typeof usePlayerStore>;
  notify: (text: string, duration?: number) => void;
}

export function useVideoCodec(ctx: VideoCodecContext) {
  const { player, notify } = ctx;
  let audioCodecChecked = '';
  let codecGeneration = 0;

  /** Przywraca dźwięk elementu wideo (po transkodowaniu lub gdy nie udało się go podłączyć). */
  function restoreVideoVolume(): void {
    audioEngine.setVideoVolume(player.isMuted ? 0 : player.volume);
  }

  async function checkVideoAudioCodec(track: MediaFile, el: HTMLVideoElement): Promise<void> {
    if (audioCodecChecked === track.path) return;
    audioCodecChecked = track.path;
    const generation = ++codecGeneration;

    // Utwór zmienił się w trakcie asynchronicznej analizy. Jeśli zdążyliśmy
    // wyciszyć element wideo, przywróć głośność; a marker analizy posprzątaj,
    // żeby powrót do tego samego pliku ponownie sprawdził kodek.
    const stale = (restoreVolume: boolean): boolean => {
      if (generation === codecGeneration) return false;
      if (audioCodecChecked === track.path) audioCodecChecked = '';
      if (restoreVolume) restoreVideoVolume();
      return true;
    };

    const result = await window.api?.checkAudioCodec(track.path);
    if (!result || result.supported) return;
    if (stale(false)) return;

    audioEngine.setVideoVolume(0);
    const seekPos = el.currentTime || 0;

    const chunkPath = await window.api?.transcodeAudioChunk(track.path, seekPos, 30);
    if (stale(true)) return;
    if (chunkPath) {
      try {
        await audioEngine.connectSecondaryAudio(chunkPath, seekPos);
        if (!el.paused && player.isPlaying) {
          audioEngine.playSecondaryAudio();
        }
      } catch {
        /* chunk nie powiódł się — przejdź do pełnego transkodowania */
      }
    }

    const fullPath = await window.api?.transcodeAudio(track.path);
    if (stale(true)) return;
    if (fullPath) {
      if (fullPath === chunkPath) return;
      audioEngine.disconnectSecondaryAudio();
      try {
        await audioEngine.connectSecondaryAudio(fullPath, 0);
        audioEngine.seekSecondaryAudio(el.currentTime);
        if (!el.paused && player.isPlaying) {
          audioEngine.playSecondaryAudio();
        }
      } catch {
        restoreVideoVolume();
        notify(i18n.global.t('player.audioPlaybackFailed'), 3000);
      }
      return;
    }

    // Transkodowanie nie udało się (brak ffmpeg itp.) — przywróć dźwięk
    // elementu, żeby wideo nie grało po cichu, i daj znać. Resetujemy cache,
    // żeby następny utwór/próba mogły spróbować ponownie.
    restoreVideoVolume();
    audioCodecChecked = '';
    notify(i18n.global.t('player.audioCodecUnsupported'), 5000);
  }

  return { checkVideoAudioCodec };
}
