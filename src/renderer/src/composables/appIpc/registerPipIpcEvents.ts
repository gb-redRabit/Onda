import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import type { usePlayerStore } from '@renderer/stores/player';
import { createListenerScope } from './listeners';

type PlayerStore = ReturnType<typeof usePlayerStore>;

// Globalne IPC Picture-in-Picture — aktywne nawet gdy `PlayerView` jest
// odmontowany (plan 2.8).
export function registerPipIpcEvents(
  player: PlayerStore,
  router: Router,
  route: RouteLocationNormalizedLoaded
): () => void {
  const { listen, dispose } = createListenerScope();

  listen('pip:closed', () => {
    player.pipActive = false;
    player.pipTime = 0;
  });
  listen('pip:ended', () => {
    // `queueLength` obejmuje `pendingQueue` (pliki dołączone z listy/folderu), którego
    // `queue` nie widzi — wcześniej PiP zatrzymywał się zamiast przejść dalej.
    if (player.queueLength > 0) {
      player.nextTrack();
    } else {
      window.api?.pipStop();
    }
  });
  listen('pip:maximize', (time: unknown) => {
    const t = (time as number) || 0;
    player.pipActive = false;
    player.pipTime = 0;
    player.currentTime = t;
    player.isPlaying = true;
    // `pendingFullscreen` ustawiamy TYLKO gdy trzeba nawigować do odtwarzacza —
    // inaczej zostawał ustawiony na /player i konsumowany przy następnym montażu
    // widoku, nieoczekiwanie przełączając pełny ekran. Gdy już jesteśmy na /player,
    // robi to `onMaximize`.
    if (route.name !== 'player') {
      player.pendingFullscreen = true;
      router.push('/player');
    }
  });
  // Przywrócenie zażądane z głównego okna (pasek odtwarzacza / przycisk menu): przenosi
  // wideo z powrotem do odtwarzacza na ostatniej znanej pozycji, bez pełnego ekranu.
  listen('pip:restore', (time: unknown) => {
    const t = (time as number) || 0;
    player.pipActive = false;
    player.pipTime = 0;
    player.currentTime = t;
    player.isPlaying = true;
    if (route.name !== 'player') router.push('/player');
  });

  return dispose;
}
