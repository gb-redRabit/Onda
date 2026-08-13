<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, computed, defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadLocaleMessages } from './i18n';
import { useSettingsStore } from './stores/settings';
import { usePlayerStore } from './stores/player';
import { useUIStore } from './stores/ui';
import { useLibraryStore } from './stores/library';
import { useExplorerStore } from './stores/explorer';
import { claimTabDrag } from './utils/tabDrag';
import { openMediaFiles } from './composables/useOpenMedia';
import { moduleManager } from './modules/ModuleManager';
import { useAudioPiP } from './composables/useAudioPiP';
import { useTheme } from './composables/useTheme';
import { useNewVideoNotifications } from './composables/useNewVideoNotifications';
import { useMediaSession } from './composables/useMediaSession';
import { useSessionPersistence } from './composables/useSessionPersistence';
import AppMenu from './components/layout/AppMenu.vue';
import Sidebar from './components/layout/Sidebar.vue';
import PlayerBar from './components/layout/PlayerBar.vue';
import StatusBar from './components/layout/StatusBar.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import FirstRunWizard from './components/FirstRunWizard.vue';

const QueuePanel = defineAsyncComponent(() => import('./components/player/QueuePanel.vue'));
const Equalizer = defineAsyncComponent(() => import('./components/player/Equalizer.vue'));
const CommandPalette = defineAsyncComponent(() => import('./components/CommandPalette.vue'));
const ToastNotification = defineAsyncComponent(() => import('./components/ToastNotification.vue'));

const settings = useSettingsStore();
const player = usePlayerStore();
const ui = useUIStore();
const library = useLibraryStore();
const route = useRoute();
const router = useRouter();
const audioPip = useAudioPiP();
useNewVideoNotifications();
useMediaSession();
const session = useSessionPersistence();
const showFirstRun = ref(false);

const isExplorerWindow = computed(() => route.name === 'explorer-window');

const theme = useTheme(settings.appearance);

onMounted(async () => {
  document.addEventListener('keydown', onGlobalKeydown);
  document.addEventListener('mousedown', onGlobalMouseDown);
  window.addEventListener('blur', onWindowBlur);
  await settings.load();
  theme.applyTheme();
  await loadLocaleMessages(settings.appearance.locale);
  library.loadFromDisk();
  if (!moduleManager.getActive()) {
    await moduleManager.switchTo('home');
  }
  audioPip.mode.value = settings.appearance.audioPipMode;
  audioPip.setAutoShow(settings.appearance.audioPipAutoShow);

  // Restore the last played track + queue (opt-in via settings).
  if (settings.general.restoreSession) {
    void session.restore(router);
  }

  // First-run wizard (one time).
  try {
    if (!localStorage.getItem('onda-first-run-done')) showFirstRun.value = true;
  } catch {
    /* storage unavailable */
  }

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
  try {
    const pending = (await window.api?.invoke('app:getPendingFiles')) as string[] | undefined;
    if (Array.isArray(pending) && pending.length) {
      const files = pending.filter((p): p is string => typeof p === 'string');
      if (files.length) void openMediaFiles(files, router);
    }
  } catch {
    /* pending files unavailable */
  }
});

onBeforeUnmount(() => {
  moduleManager.deactivateAll();
  document.removeEventListener('keydown', onGlobalKeydown);
  document.removeEventListener('mousedown', onGlobalMouseDown);
  window.removeEventListener('blur', onWindowBlur);
});

watch(
  () => settings.appearance.locale,
  async (loc) => {
    await loadLocaleMessages(loc);
    window.api?.send('pip:locale', loc);
    try {
      localStorage.setItem('onda-locale', loc);
    } catch {
      /* noop */
    }
  }
);

watch(
  () => player.currentTrack,
  (track) => {
    if (track?.type === 'video' && route.name !== 'player') {
      router.push('/player');
    }
  }
);

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (!document.querySelector('input:focus, textarea:focus')) {
      ui.toggleCommandPalette();
    }
  }
  if (e.key === 'Escape') {
    ui.hideContextMenu();
  }
}

function onGlobalMouseDown(e: MouseEvent) {
  const el = document.getElementById('context-menu');
  if (el && !el.contains(e.target as Node)) {
    ui.hideContextMenu();
  }
}

function onWindowBlur() {
  if (settings.playback.autoPauseOnFocusLoss && player.isPlaying) {
    player.pause();
  }
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden">
    <AppMenu v-if="ui.topMenuVisible && !isExplorerWindow" />
    <div class="flex flex-1 min-h-0">
      <Sidebar v-if="!isExplorerWindow && settings.appearance.sidebarPosition === 'left'" />
      <main class="flex-1 min-w-0 relative overflow-auto flex flex-col">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <ErrorBoundary>
              <component :is="Component" />
            </ErrorBoundary>
          </transition>
        </router-view>
      </main>
      <QueuePanel v-if="!isExplorerWindow && player.queueVisible" class="w-75 shrink-0" />
      <Sidebar v-if="!isExplorerWindow && settings.appearance.sidebarPosition === 'right'" />
      <div v-if="!isExplorerWindow && player.equalizerVisible" class="fixed bottom-24 right-6 z-40">
        <Equalizer />
      </div>
    </div>
    <PlayerBar
      v-if="
        !isExplorerWindow &&
        ui.playerBarVisible &&
        player.currentTrack?.type === 'audio' &&
        route.name !== 'player' &&
        route.name !== 'audio'
      "
    />
    <StatusBar v-if="ui.statusBarVisible && !isExplorerWindow" />

    <CommandPalette />
    <ToastNotification />
    <FirstRunWizard v-if="showFirstRun" @close="showFirstRun = false" />

    <div
      v-if="ui.contextMenu"
      id="context-menu"
      class="fixed z-50 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/50 py-1.5 min-w-45"
      :style="{ left: ui.contextMenu.x + 'px', top: ui.contextMenu.y + 'px' }"
      @click.stop
    >
      <template v-for="(item, idx) in ui.contextMenu.items" :key="idx">
        <div v-if="item.separator" class="border-t border-border-default my-1 mx-2" />
        <button
          v-else
          class="w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors"
          :class="{ 'opacity-40 pointer-events-none': item.disabled }"
          @click="
            item.action?.();
            ui.hideContextMenu();
          "
        >
          <span>{{ item.label }}</span>
          <span v-if="item.shortcut" class="text-[10px] text-fg-faint/60 font-mono">{{
            item.shortcut
          }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.12s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
