import { ref, onMounted, onUnmounted } from 'vue';
import { audioEvents } from '@renderer/utils/audioEvents';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { currentTime, duration } from '@renderer/composables/useAudioPlayer';

type PipMode = 'minimal' | 'medium' | 'max';

interface AudioPipState {
  trackName: string;
  artist: string;
  coverData: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

export function useAudioPiP() {
  const isActive = ref(false);
  const mode = ref<PipMode>('minimal');

  const cleanups: (() => void)[] = [];
  let lastState: AudioPipState = {
    trackName: '', artist: '', coverData: null,
    isPlaying: false, currentTime: 0, duration: 0, volume: 1
  };

  let autoShowEnabled = true;
  let timeInterval: ReturnType<typeof setInterval> | null = null;

  function getStateFromPlayer(): AudioPipState {
    const player = usePlayerStore();
    const track = player.currentTrack;
    const state = {
      trackName: track?.name || '',
      artist: (track?.metadata?.artist) || '',
      coverData: player.getCover(track?.path || '').data || null,
      isPlaying: player.isPlaying,
      currentTime: currentTime.value,
      duration: duration.value,
      volume: player.volume
    };
    return state;
  }

  function sendUpdate(state: AudioPipState) {
    lastState = { ...state };
    const settings = useSettingsStore();
    window.api?.audioPipUpdate(state, mode.value, settings.appearance.audioPipOpacity);
  }

  async function show() {
    const state = getStateFromPlayer();
    if (!state.trackName) return;
    lastState = { ...state };
    isActive.value = true;
    const settings = useSettingsStore();
    await window.api?.audioPipShow(state, mode.value, settings.appearance.audioPipOpacity);
    startTimeTracking();
  }

  async function hide() {
    isActive.value = false;
    stopTimeTracking();
    await window.api?.audioPipHide();
  }

  function startTimeTracking() {
    stopTimeTracking();
    timeInterval = setInterval(() => {
      if (!isActive.value) { stopTimeTracking(); return; }
      const state = getStateFromPlayer();
      lastState = { ...state };
      window.api?.send('audio-pip:timeUpdate', lastState);
    }, 500);
  }

  function stopTimeTracking() {
    if (timeInterval) {
      clearInterval(timeInterval);
      timeInterval = null;
    }
  }

  function handleVisibilityChange() {
    if (!autoShowEnabled) return;
    const player = usePlayerStore();
    if (document.hidden && player.currentTrack && player.currentTrack.type === 'audio' && player.isPlaying) {
      show();
    } else if (!document.hidden && isActive.value) {
      hide();
    }
  }

  function handleAction(action: string) {
    const player = usePlayerStore();
    if (action === 'playPause') {
      player.togglePlay();
    } else if (action === 'next') {
      player.nextTrack();
    } else if (action === 'prev') {
      player.prevTrack();
    } else if (action.startsWith('volume:')) {
      const vol = parseFloat(action.slice(7));
      if (!isNaN(vol)) player.setVolume(vol);
    }
  }

  function handleProgressClick(percent: number) {
    audioEngine.seek(percent * duration.value);
  }

  onMounted(() => {
    if (!window.api) return;

    const removeAction = window.api.on('audio-pip:action', (action: unknown) => {
      handleAction(action as string);
    });
    cleanups.push(removeAction);

    const removeProgress = window.api.on('audio-pip:progressClick', (percent: unknown) => {
      handleProgressClick(percent as number);
    });
    cleanups.push(removeProgress);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const onTrackChange = () => {
      if (isActive.value) {
        const state = getStateFromPlayer();
        sendUpdate(state);
        if (state.isPlaying) {
          startTimeTracking();
        }
      }
    };

    const onPlayState = (playing: boolean) => {
      if (isActive.value) {
        const fresh = getStateFromPlayer();
        fresh.isPlaying = playing;
        sendUpdate(fresh);
        if (playing) {
          startTimeTracking();
        } else {
          stopTimeTracking();
        }
      }
      if (document.hidden && playing && !isActive.value && autoShowEnabled) {
        show();
      }
    };

    audioEvents.on('trackLoaded', onTrackChange);
    audioEvents.on('playStateChange', onPlayState);

    cleanups.push(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });
  });

  onUnmounted(() => {
    stopTimeTracking();
    cleanups.forEach((fn) => fn());
  });

  return {
    isActive,
    mode,
    show,
    hide,
    setAutoShow: (v: boolean) => { autoShowEnabled = v; }
  };
}
