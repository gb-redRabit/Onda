import { watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { coreState, initCoreClient } from '@renderer/core/coreClient';

/**
 * Odbija stan Core w lokalnym store playera. Nie wywołuje akcji store'a, więc nie
 * wysyła komend z powrotem do Core (brak pętli). Uruchamiane raz w App.vue, tylko
 * w trybie shellu.
 */
export function useCoreSync(): void {
  initCoreClient();
  const player = usePlayerStore();
  let lastLoggedPath = '';
  let lastLoggedAt = 0;

  watch(
    coreState,
    (state) => {
      if (!state) return;
      const now = Date.now();
      if (state.current?.path !== lastLoggedPath || now - lastLoggedAt > 4000) {
        lastLoggedPath = state.current?.path ?? '';
        lastLoggedAt = now;
        console.info(
          '[core-shell]',
          `sync track=${state.current?.name ?? 'none'} intent=${state.isPlaying} ` +
            `engine=${state.enginePlaying} time=${state.currentTime.toFixed(1)}/` +
            `${state.duration.toFixed(1)} queue=${state.queue.length}`
        );
      }
      player.currentTrack = state.current;
      player.queue = state.queue;
      player.pendingQueue = state.pendingQueue;
      player.history = state.history;
      player.isPlaying = state.isPlaying;
      player.currentTime = state.currentTime;
      player.duration = state.duration;
      player.volume = state.volume;
      player.isMuted = state.isMuted;
      player.shuffle = state.shuffle;
      player.repeat = state.repeat;
      player.pipActive = state.pipActive;
      player.pipTime = state.pipTime;
    },
    { immediate: true }
  );
}
