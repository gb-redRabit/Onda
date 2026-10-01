import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import type { usePlayerStore } from '@renderer/stores/player';
import { useExplorerStore } from '@renderer/stores/explorer';
import { claimTabDrag } from '@renderer/utils/tabDrag';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';

export interface AppIpcDeps {
  player: ReturnType<typeof usePlayerStore>;
  router: Router;
  route: RouteLocationNormalizedLoaded;
}

// Globalne nasłuchy IPC rejestrowane raz w `App.vue` (plan 2.8): klawisze mediów/tray,
// PiP wideo, zakładki eksploratora między oknami oraz pliki systemowe "otwórz za pomocą".
export function registerAppIpc({ player, router, route }: AppIpcDeps): void {
  // globalne klawisze mediów / tray — podłączone do store odtwarzacza
  window.api?.on('media:playPause', () => player.togglePlay());
  window.api?.on('media:next', () => player.nextTrack());
  window.api?.on('media:previous', () => player.prevTrack());
  window.api?.on('media:stop', () => {
    player.pause();
    player.seek(0);
  });
  window.api?.on('media:volumeUp', () => player.setVolume(player.volume + 0.05));
  window.api?.on('media:volumeDown', () => player.setVolume(player.volume - 0.05));
  window.api?.on('media:toggleMute', () => player.toggleMute());

  // globalne IPC PiP — aktywne nawet gdy PlayerView jest odmontowany
  window.api?.on('pip:closed', (_time: unknown) => {
    player.pipActive = false;
    player.pipTime = 0;
  });
  window.api?.on('pip:ended', () => {
    if (player.queue.length > 0) {
      player.nextTrack();
    } else {
      window.api?.pipStop();
    }
  });
  window.api?.on('pip:maximize', (time: unknown) => {
    const t = (time as number) || 0;
    player.pipActive = false;
    player.pipTime = 0;
    player.currentTime = t;
    player.isPlaying = true;
    player.pendingFullscreen = true;
    if (route.name !== 'player') router.push('/player');
  });
  // Przywrócenie zażądane z głównego okna (pasek odtwarzacza / przycisk menu): przenosi
  // wideo z powrotem do odtwarzacza na ostatniej znanej pozycji, bez pełnego ekranu.
  window.api?.on('pip:restore', (time: unknown) => {
    const t = (time as number) || 0;
    player.pipActive = false;
    player.pipTime = 0;
    player.currentTime = t;
    player.isPlaying = true;
    if (route.name !== 'player') router.push('/player');
  });

  // zakładki eksploratora między oknami (zakładka przeniesiona między oknami)
  window.api?.on('explorer:add-tab', (path: unknown) => {
    if (typeof path === 'string') useExplorerStore().addTab(path);
  });
  window.api?.on('explorer:refresh', () => {
    const explorerStore = useExplorerStore();
    explorerStore.loadFiles(explorerStore.currentPath);
  });
  window.api?.on('explorer:remove-tab', (path: unknown) => {
    if (typeof path !== 'string') return;
    claimTabDrag(path);
    const explorerStore = useExplorerStore();
    const idx = explorerStore.tabs.findIndex((tab) => tab.path === path);
    if (idx < 0) return;
    if (explorerStore.tabs.length <= 1) {
      if (route.name === 'explorer-window') {
        window.api?.invoke('window:close');
      } else {
        explorerStore.navigateTo('');
      }
      return;
    }
    explorerStore.closeTab(idx);
  });

  // pliki otwarte z systemu (skojarzenia plików / przekazywanie single-instance)
  window.api?.on('open-files', (paths: unknown) => {
    if (Array.isArray(paths)) {
      const files = paths.filter((p): p is string => typeof p === 'string');
      if (files.length) void openMediaFiles(files, router);
    }
  });

  // Pobiera pliki zakolejkowane, gdy aplikacja jeszcze się uruchamiała.
  void (async () => {
    try {
      const pending = (await window.api?.invoke('app:getPendingFiles')) as string[] | undefined;
      if (Array.isArray(pending) && pending.length) {
        const files = pending.filter((p): p is string => typeof p === 'string');
        if (files.length) void openMediaFiles(files, router);
      }
    } catch {
      /* oczekujące pliki niedostępne */
    }
  })();
}
