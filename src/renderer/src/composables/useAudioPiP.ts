import { ref, watch, onMounted, onUnmounted } from 'vue';
import { audioEvents } from '@renderer/utils/audioEvents';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { currentTime, duration, useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { EQUALIZER_PRESETS } from '@renderer/utils/constants';

type PipMode = 'minimal' | 'medium' | 'max' | 'wide';

interface AudioPipState extends Record<string, unknown> {
  trackName: string;
  artist: string;
  coverData: string | null;
  coverType: 'image' | 'video' | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted?: boolean;
  shuffle?: boolean;
  repeat?: 'none' | 'all' | 'one';
  equalizerBands?: number[];
  equalizerPreset?: string;
  vizData?: number[];
  nextTrackName?: string;
  nextTrackArtist?: string;
}

function getFrequencyBins(): number[] {
  try {
    const analyser = audioEngine.getAnalyserNode();
    if (!analyser) return [];
    const len = analyser.frequencyBinCount;
    const raw = new Uint8Array(len);
    analyser.getByteFrequencyData(raw);
    // reduce 1024 bins → 64
    const count = 64;
    const bins: number[] = [];
    const binSize = Math.floor(len / count);
    for (let i = 0; i < count; i++) {
      let sum = 0;
      const start = i * binSize;
      const end = Math.min(start + binSize, len);
      for (let j = start; j < end; j++) sum += raw[j];
      bins.push(Math.round(sum / (end - start)));
    }
    return bins;
  } catch {
    return [];
  }
}

export function useAudioPiP() {
  const isActive = ref(false);
  const mode = ref<PipMode>('minimal');

  const cleanups: (() => void)[] = [];
  let lastState: AudioPipState = {
    trackName: '',
    artist: '',
    coverData: null,
    coverType: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1
  };

  let autoShowEnabled = true;
  let timeInterval: ReturnType<typeof setInterval> | null = null;
  let vizInterval: ReturnType<typeof setInterval> | null = null;
  let coverRetryTimer: ReturnType<typeof setInterval> | null = null;
  let coverRetryCount = 0;

  function getState() {
    const player = usePlayerStore();
    const track = player.currentTrack;
    const path = track?.path || '';
    const cached = player.getCover(path);
    if (path && !cached.data) player.loadCover(path);
    const nextTrack = player.displayQueue[0];
    return {
      trackName: '' + (track?.name || ''),
      artist: '' + (track?.metadata?.artist || ''),
      coverData: cached.data || null,
      coverType: cached.type || null,
      isPlaying: !!player.isPlaying,
      shuffle: !!player.shuffle,
      repeat: player.repeat || 'none',
      currentTime: +currentTime.value,
      duration: +duration.value,
      volume: +player.volume,
      isMuted: !!player.isMuted,
      equalizerBands: (player.equalizerBands || []).slice(),
      equalizerPreset: player.equalizerPreset || 'flat',
      vizData: getFrequencyBins(),
      nextTrackName: '' + (nextTrack?.name || ''),
      nextTrackArtist: '' + (nextTrack?.metadata?.artist || '')
    };
  }

  function sendUpdate(state: AudioPipState) {
    lastState = { ...state };
    const settings = useSettingsStore();
    window.api?.audioPipUpdate(
      state,
      mode.value,
      settings.appearance.audioPipOpacity,
      settings.appearance.audioPipPosition
    );
  }

  async function show() {
    const state = getState();
    if (!state.trackName) return;
    lastState = { ...state };
    isActive.value = true;
    const settings = useSettingsStore();
    await window.api?.audioPipShow(
      state,
      mode.value,
      settings.appearance.audioPipOpacity,
      settings.appearance.audioPipPosition
    );
    startCoverRetry();
    startTimeTracking();
    startVizTracking();
  }

  async function hide() {
    isActive.value = false;
    stopTimeTracking();
    stopVizTracking();
    await window.api?.audioPipHide();
  }

  function startVizTracking() {
    stopVizTracking();
    vizInterval = setInterval(() => {
      if (!isActive.value) {
        stopVizTracking();
        return;
      }
      window.api?.send('audio-pip:vizData', getFrequencyBins());
    }, 60);
  }

  function stopVizTracking() {
    if (vizInterval) {
      clearInterval(vizInterval);
      vizInterval = null;
    }
  }

  function startTimeTracking() {
    stopTimeTracking();
    timeInterval = setInterval(() => {
      if (!isActive.value) {
        stopTimeTracking();
        return;
      }
      const state = getState();
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

  function startCoverRetry() {
    stopCoverRetry();
    coverRetryCount = 0;
    coverRetryTimer = setInterval(() => {
      if (!isActive.value) {
        stopCoverRetry();
        return;
      }
      const state = getState();
      if (state.coverData || coverRetryCount >= 10) {
        stopCoverRetry();
      }
      if (state.coverData && state.coverData !== lastState.coverData) {
        lastState = { ...state };
        sendUpdate(state);
      }
      coverRetryCount++;
    }, 200);
  }

  function stopCoverRetry() {
    if (coverRetryTimer) {
      clearInterval(coverRetryTimer);
      coverRetryTimer = null;
    }
  }

  function handleVisibilityChange() {
    if (!autoShowEnabled) return;
    const player = usePlayerStore();
    if (
      document.hidden &&
      player.currentTrack &&
      player.currentTrack.type === 'audio' &&
      player.isPlaying
    ) {
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
    } else if (action === 'shuffle') {
      player.toggleShuffle();
    } else if (action === 'repeat') {
      player.cycleRepeat();
    } else if (action.startsWith('volume:')) {
      const vol = parseFloat(action.slice(7));
      if (!isNaN(vol)) {
        player.setVolume(vol);
      }
    } else if (action === 'cycleMode') {
      const settings = useSettingsStore();
      const modes: PipMode[] = ['minimal', 'medium', 'max', 'wide'];
      const idx = modes.indexOf(mode.value);
      const next = modes[(idx + 1) % modes.length];
      mode.value = next;
      settings.updateAppearance({ audioPipMode: next });
    } else if (action === 'mute') {
      player.toggleMute();
    } else if (action.startsWith('eqPreset:')) {
      const presetName = action.slice(9);
      const { applyEqPreset } = useAudioPlayer();
      const presets = EQUALIZER_PRESETS;
      if (presets[presetName]) {
        player.equalizerPreset = presetName;
        applyEqPreset(presets[presetName]);
      }
    }
  }

  function handleProgressClick(percent: number) {
    audioEngine.seek(percent * duration.value);
  }

  onMounted(() => {
    if (!window.api) return;

    const removeClosed = window.api.on('audio-pip:closed', () => {
      isActive.value = false;
      stopTimeTracking();
      stopVizTracking();
      stopCoverRetry();
    });
    cleanups.push(removeClosed);

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
        const state = getState();
        sendUpdate(state);
        startCoverRetry();
        if (state.isPlaying) {
          startTimeTracking();
          startVizTracking();
        }
      }
    };

    const onPlayState = (playing: boolean) => {
      if (isActive.value) {
        const fresh = getState();
        fresh.isPlaying = playing;
        sendUpdate(fresh);
        if (playing) {
          startTimeTracking();
          startVizTracking();
        } else {
          stopTimeTracking();
          stopVizTracking();
        }
      }
      if (document.hidden && playing && !isActive.value && autoShowEnabled) {
        show();
      }
    };

    cleanups.push(audioEvents.on('trackLoaded', onTrackChange));
    cleanups.push(audioEvents.on('playStateChange', onPlayState));

    cleanups.push(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    const settings = useSettingsStore();
    const stopSettingsWatch = watch(
      [
        () => settings.appearance.audioPipMode,
        () => settings.appearance.audioPipOpacity,
        () => settings.appearance.audioPipPosition
      ],
      () => {
        mode.value = settings.appearance.audioPipMode;
        if (isActive.value) {
          sendUpdate(getState());
        }
      }
    );
    cleanups.push(stopSettingsWatch);
  });

  onUnmounted(() => {
    stopTimeTracking();
    stopVizTracking();
    stopCoverRetry();
    cleanups.forEach((fn) => fn());
  });

  return {
    isActive,
    mode,
    show,
    hide,
    setAutoShow: (v: boolean) => {
      autoShowEnabled = v;
    },
    setMode: (m: PipMode) => {
      mode.value = m;
    }
  };
}
