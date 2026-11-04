import { ref, watch, onMounted, onUnmounted } from 'vue';
import { audioEvents } from '@renderer/utils/audioEvents';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import {
  duration,
  isPlaying as mediaPlaying,
  useAudioPlayer
} from '@renderer/composables/useAudioPlayer';
import { buildAudioPipState, resolveAudioPipLayoutOpts, type AudioPipDock } from './audioPipState';
import { createAudioPipRuntime } from './audioPipRuntime';
import { dispatchAudioPipAction } from './audioPipActions';
import { isCoreShell } from '@renderer/utils/runtimeMode';

// Singleton, dzięki czemu stan audio PiP jest współdzielony w całej aplikacji (App.vue
// zarządza cyklem życia, widoki przełączają pokaż/ukryj).
const isActive = ref(false);
const dock = ref<AudioPipDock>('bottom-right');
let autoShowEnabled = true;
const cleanups: (() => void)[] = [];

const runtime = createAudioPipRuntime({
  isActive: () => isActive.value,
  getState: () => buildAudioPipState()
});

// Ukryty renderer PiP to ~100 MB. Po 5 min bez aktywnego PiP i bez odtwarzania
// niszczymy okno; następne show()/prewarm() odtworzy je bez utraty funkcji.
const RELEASE_IDLE_MS = 5 * 60 * 1000;
let releaseTimer: number | null = null;

function armReleaseTimer(): void {
  if (releaseTimer !== null) window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    releaseTimer = null;
    if (isActive.value || mediaPlaying.value) {
      armReleaseTimer();
      return;
    }
    void window.api?.audioPipRelease?.();
  }, RELEASE_IDLE_MS);
}

function disarmReleaseTimer(): void {
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

async function show(): Promise<void> {
  const state = buildAudioPipState();
  if (!state.trackName) return;
  runtime.setLastState(state);
  isActive.value = true;
  await window.api?.audioPipShow(state, resolveAudioPipLayoutOpts());
  runtime.startCoverRetry();
  runtime.startTimeTracking();
  runtime.startVizTracking();
  armReleaseTimer();
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
  // Sprawdzamy RZECZYWISTY stan elementu audio (`mediaPlaying`), nie `player.isPlaying`:
  // dla strumieni `player.isPlaying` potrafi zostać `true` po zakończeniu, co pokazywało
  // PiP bez dźwięku (np. podczas przeglądania galerii zdjęć).
  if (
    document.hidden &&
    player.currentTrack &&
    (player.currentTrack.type === 'audio' || player.currentTrack.type === 'stream') &&
    mediaPlaying.value
  ) {
    void show();
  } else if (!document.hidden && isActive.value) {
    void hide();
  }
}

function handleAction(action: string): void {
  dispatchAudioPipAction(action);
}

function handleProgressClick(percent: number): void {
  useAudioPlayer().seek(percent * duration.value);
}

let registered = false;

export function useAudioPiP(options: { prewarm?: boolean | 'track' } = {}) {
  if (!registered) {
    registered = true;

    onMounted(() => {
      if (!window.api) return;
      // Prewarm okna PiP: `track` odkłada koszt (~100 MB renderera) do momentu,
      // gdy jest już co pokazać, `false` wyłącza go w compactcie, `true`
      // zachowuje stare, natychmiastowe zachowanie.
      if (options.prewarm === true) {
        void window.api?.audioPipPrewarm?.();
        armReleaseTimer();
      }

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

      const player = usePlayerStore();
      const onTrackChange = () => {
        // Pierwszy utwór to pierwsza realna intencja PiP: dopiero wtedy tworzymy
        // ukryty renderer, zamiast trzymać ~100 MB od startu aplikacji.
        if (options.prewarm === 'track' && player.currentTrack) {
          void window.api?.audioPipPrewarm?.();
          armReleaseTimer();
        }
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

      // Core Shell nie emituje lokalnych `audioEvents` — stan playera jest
      // odbiciem `core:state`, więc PiP musi reagować na store, nie na silnik.
      if (isCoreShell()) {
        cleanups.push(watch(() => player.currentTrack, onTrackChange));
        cleanups.push(watch(() => player.isPlaying, onPlayState));
      }

      cleanups.push(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      });

      const settings = useSettingsStore();
      dock.value = settings.appearance.audioPipDock;
      const stopSettingsWatch = watch(
        [
          () => settings.appearance.audioPipDock,
          () => settings.appearance.audioPipCornerElements,
          () => settings.appearance.audioPipEdgeElements,
          () => settings.appearance.audioPipAutoHide
        ],
        () => {
          dock.value = settings.appearance.audioPipDock;
          if (isActive.value) {
            runtime.sendUpdate(buildAudioPipState());
          }
        },
        { deep: true }
      );
      cleanups.push(stopSettingsWatch);
    });

    onUnmounted(() => {
      disarmReleaseTimer();
      runtime.stopAll();
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
      registered = false;
    });
  }

  return {
    isActive,
    dock,
    show,
    hide,
    toggle,
    setAutoShow: (v: boolean) => {
      autoShowEnabled = v;
    },
    setDock: (d: AudioPipDock) => {
      dock.value = d;
    }
  };
}
