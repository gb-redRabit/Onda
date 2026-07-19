import { ref, computed } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

let _initialized = false;

const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(false);
const mediaEl = ref<HTMLAudioElement | null>(null);
const isReady = ref(false);
const error = ref<string | null>(null);

function resumeAndPlay() {
  audioEngine.resume();
  setTimeout(() => audioEngine.play(), 50);
}

export function useAudioPlayer() {
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

    audioEngine.onTimeUpdate = (time: number) => {
      currentTime.value = time;
    };

    audioEngine.onDurationChange = (dur: number) => {
      duration.value = dur;
    };

    audioEngine.onPlayStateChange = (playing: boolean) => {
      isPlaying.value = playing;
    };

    audioEngine.onTrackEnd = () => {
      player.nextTrack();
    };

    let _lastTrackPath: string | null = null;

    player.$subscribe((_mutation, state) => {
      const track = state.currentTrack;
      const path = track?.path ?? null;
      if (path === _lastTrackPath) return;
      _lastTrackPath = path;

      if (!track) {
        audioEngine.pause();
        return;
      }

      if (track.type === 'video') {
        audioEngine.pause();
      } else if (track.type === 'audio') {
        audioEngine.loadTrack(track);
        resumeAndPlay();
        player.flushPendingQueue();
      }
    });

    let _lastPlaying: boolean | null = null;

    player.$subscribe((_mutation, state) => {
      const playing = state.isPlaying;
      if (playing === _lastPlaying) return;
      _lastPlaying = playing;

      const trackType = state.currentTrack?.type;
      if (trackType !== 'audio') return;
      if (playing) {
        resumeAndPlay();
      } else {
        audioEngine.pause();
      }
    });

    const existingTrack = player.currentTrack;
    if (existingTrack?.type === 'audio' && player.isPlaying) {
      audioEngine.loadTrack(existingTrack);
      resumeAndPlay();
    }
  }

  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));

  return {
    currentTime,
    duration,
    isPlaying,
    progress,
    mediaEl,
    isReady,
    error,
    analyserNode: audioEngine.getAnalyserNode(),
    play: () => resumeAndPlay(),
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
