import { ref, watch, onMounted, onUnmounted } from 'vue';
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
  equalizerBands?: number[];
  nextTrackName?: string;
  nextTrackArtist?: string;
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

  function getState() {
    const player = usePlayerStore();
    const track = player.currentTrack;
    const path = track?.path || '';
    const cached = player.getCover(path);
    if (path && !cached.data) player.loadCover(path);
    const nextTrack = player.displayQueue[0];
    return {
      trackName: '' + (track?.name || ''),
      artist: '' + ((track?.metadata?.artist) || ''),
      coverData: cached.data || null,
      isPlaying: !!player.isPlaying,
      currentTime: +currentTime.value,
      duration: +duration.value,
      volume: +player.volume,
      equalizerBands: (player.equalizerBands || []).slice(),
      nextTrackName: '' + ((nextTrack?.name) || ''),
      nextTrackArtist: '' + ((nextTrack?.metadata?.artist) || '')
    };
  }

  function sendUpdate(state: AudioPipState) {
    lastState = { ...state };
    const settings = useSettingsStore();
    window.api?.audioPipUpdate(state, mode.value, settings.appearance.audioPipOpacity, settings.appearance.audioPipPosition);
  }

  async function show() {
    const state = getState();
    if (!state.trackName) return;
    lastState = { ...state };
    isActive.value = true;
    const settings = useSettingsStore();
    await window.api?.audioPipShow(state, mode.value, settings.appearance.audioPipOpacity, settings.appearance.audioPipPosition);
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
    } else if (action === 'shuffle') {
      player.toggleShuffle();
    } else if (action === 'repeat') {
      player.cycleRepeat();
    } else if (action.startsWith('volume:')) {
      const vol = parseFloat(action.slice(7));
      if (!isNaN(vol)) player.setVolume(vol);
    } else if (action === 'cycleMode') {
      const settings = useSettingsStore();
      const modes: PipMode[] = ['minimal', 'medium', 'max'];
      const idx = modes.indexOf(mode.value);
      const next = modes[(idx + 1) % modes.length];
      mode.value = next;
      settings.updateAppearance({ audioPipMode: next });
    } else if (action.startsWith('mute:')) {
      const shouldMute = action.slice(5) === '1';
      if (player.isMuted !== shouldMute) player.toggleMute();
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
        const state = getState();
        sendUpdate(state);
        if (state.isPlaying) {
          startTimeTracking();
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

    const settings = useSettingsStore();
    const stopSettingsWatch = watch(
      [() => settings.appearance.audioPipMode, () => settings.appearance.audioPipOpacity, () => settings.appearance.audioPipPosition],
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
    cleanups.forEach((fn) => fn());
  });

  return {
    isActive,
    mode,
    show,
    hide,
    setAutoShow: (v: boolean) => { autoShowEnabled = v; },
    setMode: (m: PipMode) => { mode.value = m; }
  };
}
