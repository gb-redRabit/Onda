import { ref } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

let _initialized = false;
const mediaEl = ref<HTMLAudioElement | HTMLVideoElement | null>(null);
const isReady = ref(false);
const error = ref<string | null>(null);

export function useMediaPlayer() {
  const player = usePlayerStore();

  if (!_initialized) {
    _initialized = true;

    const origLoadTrack = audioEngine.loadTrack.bind(audioEngine);
    audioEngine.loadTrack = (track: MediaFile) => {
      origLoadTrack(track);
      mediaEl.value = audioEngine.getMediaElement();
      isReady.value = true;
      error.value = null;
    };

    player.$onAction(({ name, args }) => {
      if (name === 'setTrack') {
        const track = args[0] as MediaFile;
        if (track && track.type === 'video') {
          audioEngine.pause();
        } else if (track && track.type === 'audio') {
          audioEngine.loadTrack(track);
          setTimeout(() => {
            if (player.isPlaying) audioEngine.play();
          }, 100);
          player.flushPendingQueue();
        }
      }
      if (name === 'togglePlay' || name === 'play' || name === 'pause') {
        setTimeout(() => {
          if (player.isPlaying) audioEngine.play();
          else audioEngine.pause();
        }, 0);
      }
    });
  }

  return {
    mediaEl,
    isReady,
    error,
    analyserNode: audioEngine.getAnalyserNode(),
    play: () => audioEngine.play(),
    pause: () => audioEngine.pause(),
    seek: (time: number) => audioEngine.seek(time),
    setVolume: (v: number) => {
      player.setVolume(v);
      audioEngine.setVolume(player.isMuted ? 0 : v);
    },
    setPlaybackRate: (rate: number) => audioEngine.setPlaybackRate(rate),
    setEqualizerBand: (index: number, gain: number) => {
      player.equalizerBands[index] = gain;
      audioEngine.setEqualizerBand(index, gain);
    },
    applyEqPreset: (preset: Record<number, number>) => {
      Object.entries(preset).forEach(([idx, gain]) => {
        const i = parseInt(idx);
        player.equalizerBands[i] = gain;
      });
      audioEngine.applyEqPreset(preset);
    },
    savePosition: () => audioEngine.savePosition(),
    getAudioContext: () => audioEngine.getAudioContext()
  };
}
