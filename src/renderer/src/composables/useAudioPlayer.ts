import { ref, computed, watch, effectScope } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { logger } from '@shared/logger';
import { wireAudioEvents } from './audioPlayerEvents';

export const currentTime = ref(0);
export const duration = ref(0);
const buffered = ref(0);
const isPlaying = ref(false);
const volume = ref(0.8);
const mediaEl = ref<HTMLAudioElement | null>(null);
const isReady = ref(false);
const error = ref<string | null>(null);
// True between the moment a load is issued and the element becoming playable
// (used for the "buffering" indicator; streams also gate on this).
const isLoading = ref(false);

function resumeAndPlay() {
  audioEngine.resume();
  setTimeout(() => audioEngine.play(), 50);
}

let moduleInitialized = false;

function ensureModule() {
  if (moduleInitialized) return;
  moduleInitialized = true;

  wireAudioEvents({
    currentTime,
    duration,
    isPlaying,
    mediaEl,
    isReady,
    error,
    isLoading,
    buffered
  });

  const player = usePlayerStore();
  const scope = effectScope(true);

  scope.run(() => {
    watch(
      () => player.currentTrack?.path ?? null,
      (path, _oldPath) => {
        const track = player.currentTrack;
        logger.info(
          'audioPlayer',
          `currentTrack watch type=${track?.type ?? 'none'} path=${(path ?? '').slice(0, 60)}`
        );
        if (!track || !path) {
          audioEngine.pause();
          return;
        }
        if (track.type === 'video') {
          audioEngine.pause();
        } else if (track.type === 'stream') {
          audioEngine.loadRemote(track.path);
          resumeAndPlay();
          player.flushPendingQueue();
        } else if (track.type === 'audio') {
          audioEngine.loadTrack(track);
          resumeAndPlay();
          player.flushPendingQueue();
          if (useSettingsStore().playback.gaplessPlayback) {
            const next = player.pendingQueue[0] ?? player.queue[0];
            if (next && next.type === 'audio') audioEngine.preloadNext(next);
          }
        }
      }
    );

    watch(
      () => player.isPlaying,
      (playing, _wasPlaying) => {
        const trackType = player.currentTrack?.type;
        if (trackType === 'video') return;
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
  } else if (existingTrack?.type === 'stream') {
    audioEngine.loadRemote(existingTrack.path);
    if (player.isPlaying) {
      resumeAndPlay();
    }
    player.flushPendingQueue();
  }

  volume.value = player.volume;
}

export function useAudioPlayer() {
  ensureModule();

  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));

  return {
    currentTime,
    duration,
    buffered,
    isPlaying,
    volume,
    progress,
    mediaEl,
    isReady,
    isLoading,
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
