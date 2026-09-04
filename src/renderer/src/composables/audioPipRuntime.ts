import type { AudioPipState } from './audioPipState';
import {
  createEmptyAudioPipState,
  getFrequencyBins,
  resolveAudioPipLayoutOpts
} from './audioPipState';

interface AudioPipRuntimeOptions {
  isActive: () => boolean;
  getState: () => AudioPipState;
}

export function createAudioPipRuntime(opts: AudioPipRuntimeOptions) {
  const { isActive, getState } = opts;
  let lastState: AudioPipState = createEmptyAudioPipState();
  let timeInterval: ReturnType<typeof setInterval> | null = null;
  let vizInterval: ReturnType<typeof setInterval> | null = null;
  let coverRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function sendUpdate(state: AudioPipState) {
    lastState = { ...state };
    window.api?.audioPipUpdate(state, resolveAudioPipLayoutOpts());
  }

  function setLastState(state: AudioPipState): void {
    lastState = { ...state };
  }

  function vizEnabled(): boolean {
    try {
      const o = resolveAudioPipLayoutOpts();
      const active = o.dock === 'top' || o.dock === 'bottom' || o.dock === 'left' || o.dock === 'right'
        ? o.edgeElements
        : o.cornerElements;
      return active.includes('viz');
    } catch {
      return false;
    }
  }

  function startVizTracking() {
    stopVizTracking();
    if (!vizEnabled()) return;
    vizInterval = setInterval(() => {
      if (!isActive()) {
        stopVizTracking();
        return;
      }
      if (!vizEnabled()) {
        stopVizTracking();
        return;
      }
      window.api?.send('audio-pip:vizData', getFrequencyBins());
    }, 100);
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
    // Jednorazowy retry zamiast pollingu 10x200ms — cover zwykle wpada z trackLoaded.
    coverRetryTimer = setTimeout(() => {
      coverRetryTimer = null;
      if (!isActive()) return;
      const state = getState();
      if (state.coverData && state.coverData !== lastState.coverData) {
        lastState = { ...state };
        sendUpdate(state);
      }
    }, 800);
  }

  function stopCoverRetry() {
    if (coverRetryTimer) {
      clearTimeout(coverRetryTimer);
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
