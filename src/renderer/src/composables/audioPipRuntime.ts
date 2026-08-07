import type { AudioPipState } from './audioPipState';
import { createEmptyAudioPipState, getFrequencyBins, resolveAudioPipPosition, type PipMode } from './audioPipState';
import { useSettingsStore } from '@renderer/stores/settings';

export interface AudioPipRuntimeOptions {
  isActive: () => boolean;
  getState: () => AudioPipState;
  getMode: () => PipMode;
}

export function createAudioPipRuntime(opts: AudioPipRuntimeOptions) {
  const { isActive, getState, getMode } = opts;
  let lastState: AudioPipState = createEmptyAudioPipState();
  let timeInterval: ReturnType<typeof setInterval> | null = null;
  let vizInterval: ReturnType<typeof setInterval> | null = null;
  let coverRetryTimer: ReturnType<typeof setInterval> | null = null;
  let coverRetryCount = 0;

  function sendUpdate(state: AudioPipState) {
    lastState = { ...state };
    const settings = useSettingsStore();
    window.api?.audioPipUpdate(
      state,
      getMode(),
      settings.appearance.audioPipOpacity,
      resolveAudioPipPosition(getMode())
    );
  }

  function setLastState(state: AudioPipState): void {
    lastState = { ...state };
  }

  function startVizTracking() {
    stopVizTracking();
    vizInterval = setInterval(() => {
      if (!isActive()) {
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
      if (!isActive()) {
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
      if (!isActive()) {
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

  function stopAll() {
    stopTimeTracking();
    stopVizTracking();
    stopCoverRetry();
  }

  return {
    sendUpdate,
    setLastState,
    startVizTracking,
    stopVizTracking,
    startTimeTracking,
    stopTimeTracking,
    startCoverRetry,
    stopCoverRetry,
    stopAll
  };
}
