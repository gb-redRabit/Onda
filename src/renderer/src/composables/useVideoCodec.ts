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

  async function checkVideoAudioCodec(track: MediaFile, el: HTMLVideoElement): Promise<void> {
    if (audioCodecChecked === track.path) return;
    audioCodecChecked = track.path;

    const result = await window.api?.checkAudioCodec(track.path);
    if (!result || result.supported) return;

    audioEngine.setVideoVolume(0);
    const seekPos = el.currentTime || 0;

    const chunkPath = await window.api?.transcodeAudioChunk(track.path, seekPos, 30);
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
        notify('Audio playback failed', 3000);
      }
    }
  }

  return { checkVideoAudioCodec };
}
