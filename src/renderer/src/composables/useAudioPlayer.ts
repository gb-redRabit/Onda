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

export function useAudioPlayer() {
  const player = usePlayerStore();

  if (!_initialized) {
    _initialized = true;

    const origLoadTrack = audioEngine.loadTrack.bind(audioEngine);
    audioEngine.loadTrack = (track: MediaFile) => {
      console.log('[AUDIO] loadTrack:', track.name, '(' + track.type + ')');
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
      console.log('[AUDIO] onPlayStateChange:', playing ? 'PLAYING' : 'PAUSED');
      isPlaying.value = playing;
    };

    audioEngine.onTrackEnd = () => {
      console.log('[AUDIO] onTrackEnd → calling player.nextTrack()');
      player.nextTrack();
    };

    let _lastTrackPath: string | null = null;

    player.$subscribe((_mutation, state) => {
      const track = state.currentTrack;
      const path = track?.path ?? null;
      if (path === _lastTrackPath) return;
      _lastTrackPath = path;

      if (!track) {
        console.log('[AUDIO] $subscribe currentTrack → null, pausing');
        audioEngine.pause();
        return;
      }

      console.log('[AUDIO] $subscribe currentTrack →', track.name, '(' + track.type + ')');

      if (track.type === 'video') {
        console.log('[AUDIO] $subscribe → VIDEO, pausing audioEngine');
        audioEngine.pause();
      } else if (track.type === 'audio') {
        console.log('[AUDIO] $subscribe → AUDIO, loading + will play in 100ms');
        audioEngine.loadTrack(track);
        setTimeout(() => {
          console.log('[AUDIO] $subscribe setTimeout → player.isPlaying:', player.isPlaying);
          if (player.isPlaying) audioEngine.play();
        }, 100);
        player.flushPendingQueue();
      }
    });

    let _lastPlaying: boolean | null = null;

    player.$subscribe((_mutation, state) => {
      const playing = state.isPlaying;
      if (playing === _lastPlaying) return;
      _lastPlaying = playing;

      const trackType = state.currentTrack?.type;
      console.log('[AUDIO] $subscribe isPlaying →', playing ? 'PLAY' : 'PAUSE', 'trackType:', trackType);
      if (trackType !== 'audio') return;
      if (playing) audioEngine.play();
      else audioEngine.pause();
    });
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
