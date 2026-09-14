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

// Global IPC listeners registered once in `App.vue` (plan 2.8): media keys/tray,
// video PiP, cross-window explorer tabs and OS "open with" files.
export function registerAppIpc({ player, router, route }: AppIpcDeps): void {
  // global media keys / tray — wire to player store
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

  // global PiP IPC — always active even when PlayerView is unmounted
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

  // cross-window explorer tabs (tab moved between windows)
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

  // files opened from the OS (file associations / single-instance forwarding)
  window.api?.on('open-files', (paths: unknown) => {
    if (Array.isArray(paths)) {
      const files = paths.filter((p): p is string => typeof p === 'string');
      if (files.length) void openMediaFiles(files, router);
    }
  });

  // Pull any files queued while the app was still starting up.
  void (async () => {
    try {
      const pending = (await window.api?.invoke('app:getPendingFiles')) as string[] | undefined;
      if (Array.isArray(pending) && pending.length) {
        const files = pending.filter((p): p is string => typeof p === 'string');
        if (files.length) void openMediaFiles(files, router);
      }
    } catch {
      /* pending files unavailable */
    }
  })();
}
