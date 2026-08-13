import { ref, watch, onMounted, onUnmounted } from 'vue';
import { audioEvents } from '@renderer/utils/audioEvents';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { duration } from '@renderer/composables/useAudioPlayer';
import { buildAudioPipState, type PipMode } from './audioPipState';
import { resolveAudioPipPosition } from './audioPipState';
import { createAudioPipRuntime } from './audioPipRuntime';
import { dispatchAudioPipAction } from './audioPipActions';

// Singleton so the audio PiP state is shared across the whole app (App.vue
// owns the lifecycle, views toggle show/hide). This makes a manual toggle
// button in the audio player consistent with the auto-show logic.
const isActive = ref(false);
const mode = ref<PipMode>('minimal');
let autoShowEnabled = true;
const cleanups: (() => void)[] = [];

const runtime = createAudioPipRuntime({
  isActive: () => isActive.value,
  getState: () => buildAudioPipState(),
  getMode: () => mode.value
});

async function show(): Promise<void> {
  const state = buildAudioPipState();
  if (!state.trackName) return;
  runtime.setLastState(state);
  isActive.value = true;
  const settings = useSettingsStore();
  await window.api?.audioPipShow(
    state,
    mode.value,
    settings.appearance.audioPipOpacity,
    resolveAudioPipPosition(mode.value)
  );
  runtime.startCoverRetry();
  runtime.startTimeTracking();
  runtime.startVizTracking();
}

async function hide(): Promise<void> {
  isActive.value = false;
  runtime.stopAll();
  await window.api?.audioPipHide();
}

async function toggle(): Promise<void> {
  if (isActive.value) {
    await hide();
  } else {
    await show();
  }
}

function handleVisibilityChange(): void {
  if (!autoShowEnabled) return;
  const player = usePlayerStore();
  if (
    document.hidden &&
    player.currentTrack &&
    player.currentTrack.type === 'audio' &&
    player.isPlaying
  ) {
    void show();
  } else if (!document.hidden && isActive.value) {
    void hide();
  }
}

function handleAction(action: string): void {
  dispatchAudioPipAction(
    action,
    () => mode.value,
    (m) => {
      mode.value = m;
    }
  );
}

function handleProgressClick(percent: number): void {
  audioEngine.seek(percent * duration.value);
}

let registered = false;

export function useAudioPiP() {
  if (!registered) {
    registered = true;

    onMounted(() => {
      if (!window.api) return;

      const removeClosed = window.api.on('audio-pip:closed', () => {
        isActive.value = false;
        runtime.stopAll();
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
          const state = buildAudioPipState();
          runtime.sendUpdate(state);
          runtime.startCoverRetry();
          if (state.isPlaying) {
            runtime.startTimeTracking();
            runtime.startVizTracking();
          }
        }
      };

      const onPlayState = (playing: boolean) => {
        if (isActive.value) {
          const fresh = buildAudioPipState();
          fresh.isPlaying = playing;
          runtime.sendUpdate(fresh);
          if (playing) {
            runtime.startTimeTracking();
            runtime.startVizTracking();
          } else {
            runtime.stopTimeTracking();
            runtime.stopVizTracking();
          }
        }
        if (document.hidden && playing && !isActive.value && autoShowEnabled) {
          void show();
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
          () => settings.appearance.audioPipPosition,
          () => settings.appearance.audioPipEdgePosition
        ],
        () => {
          mode.value = settings.appearance.audioPipMode;
          if (isActive.value) {
            runtime.sendUpdate(buildAudioPipState());
          }
        }
      );
      cleanups.push(stopSettingsWatch);
    });

    onUnmounted(() => {
      runtime.stopAll();
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
      registered = false;
    });
  }

  return {
    isActive,
    mode,
    show,
    hide,
    toggle,
    setAutoShow: (v: boolean) => {
      autoShowEnabled = v;
    },
    setMode: (m: PipMode) => {
      mode.value = m;
    }
  };
}
