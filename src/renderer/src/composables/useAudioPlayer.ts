import { ref, computed, watch, effectScope } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

let _initialized = false;

const currentTime = ref(0);
const duration = ref(0);
const isPlaying = ref(false);
const volume = ref(0.8);
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
      if (player.repeat === 'one') {
        audioEngine.seek(0);
        audioEngine.play();
      } else {
        player.nextTrack();
      }
    };

    const scope = effectScope(true);

    scope.run(() => {
      watch(
        () => player.currentTrack?.path ?? null,
        (path) => {
          const track = player.currentTrack;
          if (!track || !path) {
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
        }
      );

      watch(
        () => player.isPlaying,
        (playing) => {
          const trackType = player.currentTrack?.type;
          if (trackType !== 'audio') return;
          if (playing) {
            resumeAndPlay();
          } else {
            audioEngine.pause();
          }
        }
      );

      watch(
        () => player.isMuted,
        (muted) => {
          audioEngine.setVolume(muted ? 0 : player.volume);
        }
      );

      watch(
        () => player.volume,
        (v) => {
          if (!player.isMuted) {
            audioEngine.setVolume(v);
          }
        }
      );
    });

    const existingTrack = player.currentTrack;
    if (existingTrack?.type === 'audio') {
      audioEngine.loadTrack(existingTrack);
      if (player.isPlaying) {
        resumeAndPlay();
      }
    }

    volume.value = player.volume;
  }

  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));

  return {
    currentTime,
    duration,
    isPlaying,
    volume,
    progress,
    mediaEl,
    isReady,
    error,
    analyserNode: audioEngine.getAnalyserNode(),
    play: () => resumeAndPlay(),
    pause: () => audioEngine.pause(),
    seek: (time: number) => audioEngine.seek(time),
    setVolume: (v: number) => {
      volume.value = v;
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
