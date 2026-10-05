import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import type { usePlayerStore } from '@renderer/stores/player';
import { registerMediaIpcEvents } from './appIpc/registerMediaIpcEvents';
import { registerPipIpcEvents } from './appIpc/registerPipIpcEvents';
import { registerExplorerIpcEvents } from './appIpc/registerExplorerIpcEvents';
import { registerSystemIpcEvents } from './appIpc/registerSystemIpcEvents';

export interface AppIpcDeps {
  player: ReturnType<typeof usePlayerStore>;
  router: Router;
  route: RouteLocationNormalizedLoaded;
}

// Globalne nasłuchy IPC rejestrowane raz w `App.vue` (plan 2.8). Kompozycja
// czterech niezależnych domen — media, PiP, eksplorator, pliki systemowe — zamiast
// jednego monolitycznego rejestratora. Każda domena zwraca własny cleanup, a ten
// wrapper tylko je spina, więc dodanie kolejnej nie dotyka pozostałych.
export function registerAppIpc({ player, router, route }: AppIpcDeps): () => void {
  const cleanups = [
    registerMediaIpcEvents(player),
    registerPipIpcEvents(player, router, route),
    registerExplorerIpcEvents(route),
    registerSystemIpcEvents(router)
  ];
  return () => {
    for (const off of cleanups) off();
  };
}
