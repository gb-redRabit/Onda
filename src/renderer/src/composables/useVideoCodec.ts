import { audioEngine } from '@renderer/modules/audioEngine';
import type { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

export interface VideoCodecContext {
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

    const result = await window.api?.checkAudioCodec(track.path);
    if (!result || result.supported) return;
    if (generation !== codecGeneration) return;

    audioEngine.setVideoVolume(0);
    const seekPos = el.currentTime || 0;

    const chunkPath = await window.api?.transcodeAudioChunk(track.path, seekPos, 30);
    if (generation !== codecGeneration) return;
    if (chunkPath) {
      try {
        await audioEngine.connectSecondaryAudio(chunkPath, seekPos);
        if (!el.paused && player.isPlaying) {
          audioEngine.playSecondaryAudio();
        }
      } catch {
        /* chunk failed — fall through to full transcode */
      }
    }

    const fullPath = await window.api?.transcodeAudio(track.path);
    if (generation !== codecGeneration) return;
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
        notify('Audio playback failed', 3000);
      }
      return;
    }

    // Transkodowanie nie udało się (brak ffmpeg itp.) — przywróć dźwięk
    // elementu, żeby wideo nie grało po cichu, i daj znać. Resetujemy cache,
    // żeby następny utwór/próba mogły spróbować ponownie.
    restoreVideoVolume();
    audioCodecChecked = '';
    notify('Audio codec not supported, sound may be missing', 5000);
  }

  return { checkVideoAudioCodec };
}
