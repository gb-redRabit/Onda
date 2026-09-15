<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, computed, defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadLocaleMessages } from './i18n';
import { useSettingsStore } from './stores/settings';
import { usePlayerStore } from './stores/player';
import { useUIStore } from './stores/ui';
import { useLibraryStore } from './stores/library';
import { matchesShortcut, matchesPluginShortcut } from './utils/shortcuts';
import { registerAppIpc } from './composables/useAppIpcEvents';
import { handlePlayerShortcutKeydown } from './composables/playerShortcutHandler';
import { moduleManager } from './modules/ModuleManager';
import { useAudioPiP } from './composables/useAudioPiP';
import { storeToRefs } from 'pinia';
import { usePluginsStore } from './stores/plugins';
import { useTheme } from './composables/useTheme';
import { useNewVideoNotifications } from './composables/useNewVideoNotifications';
import { useUpdaterNotifications } from './composables/useUpdaterNotifications';
import { useMediaSession } from './composables/useMediaSession';
import { useSessionPersistence } from './composables/useSessionPersistence';
import { audioEngine } from './modules/audioEngine';
import AppMenu from './components/layout/AppMenu.vue';
import Sidebar from './components/layout/Sidebar.vue';
import PlayerBar from './components/layout/PlayerBar.vue';
import StatusBar from './components/layout/StatusBar.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';

const FirstRunWizard = defineAsyncComponent(() => import('./components/FirstRunWizard.vue'));
const QueuePanel = defineAsyncComponent(() => import('./components/player/QueuePanel.vue'));
const Equalizer = defineAsyncComponent(() => import('./components/player/Equalizer.vue'));
const AppSearch = defineAsyncComponent(() => import('./components/layout/AppSearch.vue'));
const ToastNotification = defineAsyncComponent(() => import('./components/ToastNotification.vue'));
const ContextMenu = defineAsyncComponent(() => import('./components/ContextMenu.vue'));

const settings = useSettingsStore();
const player = usePlayerStore();
const ui = useUIStore();
const library = useLibraryStore();
const pluginsStore = usePluginsStore();
const route = useRoute();
const router = useRouter();
const audioPip = useAudioPiP();
useNewVideoNotifications();
useUpdaterNotifications();
useMediaSession();
const session = useSessionPersistence();
const isWinMaximized = ref(false);
const glassOn = computed(() => (settings.appearance.glassAlpha ?? 100) < 100);
let offMaximized: (() => void) | null = null;

const isExplorerWindow = computed(() => route.name === 'explorer-window');

const { appearance: appearanceRef } = storeToRefs(settings);
const theme = useTheme(appearanceRef);

onMounted(async () => {
  document.addEventListener('keydown', onGlobalKeydown);
  document.addEventListener('mousedown', onGlobalMouseDown);
  window.addEventListener('blur', onWindowBlur);
  offMaximized =
    window.api?.on('window:maximized', (val: unknown) => {
      isWinMaximized.value = !!val;
    }) ?? null;
  await settings.load();
  theme.applyTheme();
  await loadLocaleMessages(settings.appearance.locale);
  library.loadFromDisk();
  if (!moduleManager.getActive()) {
    await moduleManager.switchTo('home');
  }
  audioPip.dock.value = settings.appearance.audioPipDock;
  audioPip.setAutoShow(settings.appearance.audioPipAutoShow);

  // Pre-create the AudioContext in idle time so the first play click isn't
  // blocked by the one-time context creation cost.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => audioEngine.warmUp(), { timeout: 2000 });
  } else {
    setTimeout(() => audioEngine.warmUp(), 1000);
  }

  // Restore the last played track + queue (opt-in via settings).
  if (settings.general.restoreSession) {
    void session.restore(router);
  }

  // Signal to main that the app is fully mounted and theme applied —
  // main will close the splash and show the window.
  window.api?.invoke('app:rendererReady');

  // First-run wizard (one time). Re-runnable from Settings / search.
  try {
    if (!localStorage.getItem('onda-first-run-done')) ui.openSetupWizard();
  } catch {
    /* storage unavailable */
  }

  registerAppIpc({ player, router, route });
});

onBeforeUnmount(() => {
  moduleManager.deactivateAll();
  document.removeEventListener('keydown', onGlobalKeydown);
  document.removeEventListener('mousedown', onGlobalMouseDown);
  window.removeEventListener('blur', onWindowBlur);
  offMaximized?.();
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
  const searchShortcut = settings.shortcuts['search'];
  const viewSearchShortcut = settings.shortcuts['view-search'];
  if (searchShortcut && matchesShortcut(searchShortcut, e)) {
    e.preventDefault();
    if (!document.querySelector('input:focus, textarea:focus')) {
      ui.toggleGlobalSearch();
    }
    return;
  }
  if (viewSearchShortcut && matchesShortcut(viewSearchShortcut, e)) {
    const activeEl = document.activeElement as HTMLElement | null;
    const inInput = !!document.querySelector('input:focus, textarea:focus');
    if (!inInput) {
      e.preventDefault();
      if (['library', 'explorer', 'downloads'].includes(route.name as string)) {
        ui.toggleViewSearch();
      }
    } else if (activeEl?.tagName === 'INPUT' && activeEl.closest('[data-app-search]')) {
      e.preventDefault();
      ui.openSearch('view');
    }
    return;
  }
  // Navigation shortcuts (settings / explorer / library / home) — bound to
  // their editable entries in Settings → Shortcuts.
  if (!document.body.dataset.shortcutRecording) {
    const navActions: Record<string, string> = {
      settings: '/settings',
      explorer: '/explorer',
      library: '/library',
      home: '/'
    };
    for (const [action, path] of Object.entries(navActions)) {
      const shortcut = settings.shortcuts[action];
      if (shortcut && matchesShortcut(shortcut, e)) {
        if (!document.querySelector('input:focus, textarea:focus')) {
          e.preventDefault();
          router.push(path);
        }
        return;
      }
    }
  }

  if (e.key === 'Escape') {
    ui.hideContextMenu();
    ui.closeSearch();
  }

  // Plugin command shortcuts (registerCommand({ shortcut })).
  if (!document.querySelector('input:focus, textarea:focus')) {
    const normalized = matchesPluginShortcut(e);
    if (normalized && pluginsStore.dispatchShortcut(normalized)) {
      e.preventDefault();
      return;
    }
  }

  // Playback shortcuts (/player view). The listener lives here — app-level,
  // registered once — so keys work regardless of view mount/unmount churn;
  // PlayerView only donates its action context via setPlayerShortcutCtx().
  handlePlayerShortcutKeydown(e);
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
  <div
    data-testid="app-root"
    class="app-root flex flex-col h-full w-full overflow-hidden border border-base-300 bg-base-200/(--glass-alpha)"
    :class="{ 'is-maximized': isWinMaximized, 'app-root-glass': glassOn }"
  >
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
        (player.currentTrack?.type === 'audio' ||
          player.currentTrack?.type === 'stream' ||
          player.streamPending?.type === 'stream') &&
        route.name !== 'player' &&
        route.name !== 'audio'
      "
    />
    <StatusBar v-if="ui.statusBarVisible && !isExplorerWindow" />

    <AppSearch />
    <ContextMenu />
    <ToastNotification />
    <FirstRunWizard v-if="ui.setupWizardVisible" @close="ui.closeSetupWizard()" />
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
