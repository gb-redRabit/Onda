import { ref, computed, watch, effectScope } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { audioEvents } from '@renderer/utils/audioEvents';
import { usePlayerStore } from '@renderer/stores/player';

export const currentTime = ref(0);
export const duration = ref(0);
const isPlaying = ref(false);
const volume = ref(0.8);
const mediaEl = ref<HTMLAudioElement | null>(null);
const isReady = ref(false);
const error = ref<string | null>(null);

function resumeAndPlay() {
  audioEngine.resume();
  setTimeout(() => audioEngine.play(), 50);
}

let moduleInitialized = false;

function ensureModule() {
  if (moduleInitialized) return;
  moduleInitialized = true;

  audioEvents.on('timeUpdate', (time: number) => {
    currentTime.value = time;
  });

  audioEvents.on('durationChange', (dur: number) => {
    duration.value = dur;
  });

  audioEvents.on('playStateChange', (playing: boolean) => {
    isPlaying.value = playing;
    if (player.currentTrack?.type === 'audio') {
      player.isPlaying = playing;
    }
  });

  audioEvents.on('trackLoaded', () => {
    mediaEl.value = audioEngine.getMediaElement();
    isReady.value = true;
    error.value = null;
  });

  const player = usePlayerStore();
  const scope = effectScope(true);

  scope.run(() => {
    watch(
      () => player.currentTrack?.path ?? null,
      (path, _oldPath) => {
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
      (playing, _wasPlaying) => {
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

export function useAudioPlayer() {
  ensureModule();

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
      usePlayerStore().setVolume(v);
      audioEngine.setVolume(usePlayerStore().isMuted ? 0 : v);
    },
    setPlaybackRate: (rate: number) => audioEngine.setPlaybackRate(rate),
    setEqualizerBand: (index: number, gain: number) => {
      usePlayerStore().equalizerBands[index] = gain;
      audioEngine.setEqualizerBand(index, gain);
    },
    applyEqPreset: (preset: Record<number, number>) => {
      Object.entries(preset).forEach(([idx, gain]) => {
        const i = parseInt(idx);
        usePlayerStore().equalizerBands[i] = gain;
      });
      audioEngine.applyEqPreset(preset);
    },
    savePosition: () => audioEngine.savePosition(),
    getAudioContext: () => audioEngine.getAudioContext()
  };
}
