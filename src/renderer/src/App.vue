<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from './stores/settings';
import { usePlayerStore } from './stores/player';
import { useUIStore } from './stores/ui';
import { useLibraryStore } from './stores/library';
import { useExplorerStore } from './stores/explorer';
import { claimTabDrag } from './utils/tabDrag';
import { moduleManager } from './modules/ModuleManager';
import { THEME_PALETTES } from './utils/constants';
import { useAudioPiP } from './composables/useAudioPiP';
import AppMenu from './components/layout/AppMenu.vue';
import Sidebar from './components/layout/Sidebar.vue';
import PlayerBar from './components/layout/PlayerBar.vue';
import StatusBar from './components/layout/StatusBar.vue';
import QueuePanel from './components/player/QueuePanel.vue';
import Equalizer from './components/player/Equalizer.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import CommandPalette from './components/CommandPalette.vue';
import ToastNotification from './components/ToastNotification.vue';

const settings = useSettingsStore();
const player = usePlayerStore();
const ui = useUIStore();
const library = useLibraryStore();
const route = useRoute();
const router = useRouter();
const { locale } = useI18n();
const audioPip = useAudioPiP();

const isExplorerWindow = computed(() => route.name === 'explorer-window');

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function applyTheme() {
  const root = document.documentElement;
  const theme = settings.appearance.theme;
  const accent = settings.appearance.accentColor;
  const fontSize = settings.appearance.fontSize;

  const palette = THEME_PALETTES[theme] || THEME_PALETTES.dark;
  root.style.setProperty('--color-bg-base', palette.bgBase);
  root.style.setProperty('--color-bg-surface', palette.bgSurface);
  root.style.setProperty('--color-bg-overlay', palette.bgOverlay);
  root.style.setProperty('--color-bg-elevated', palette.bgElevated);
  root.style.setProperty('--color-bg-hover', palette.bgHover);
  root.style.setProperty('--color-bg-active', palette.bgActive);
  root.style.setProperty('--color-border-default', palette.borderDefault);
  root.style.setProperty('--color-border-subtle', palette.borderSubtle);
  root.style.setProperty('--color-fg-base', palette.fgBase);
  root.style.setProperty('--color-fg-muted', palette.fgMuted);
  root.style.setProperty('--color-fg-faint', palette.fgFaint);

  root.style.setProperty('--color-accent-base', accent);
  const rgb = hexToRgb(accent);
  if (rgb) {
    root.style.setProperty(
      '--color-accent-hover',
      `rgba(${Math.min(255, rgb.r + 20)}, ${Math.min(255, rgb.g + 20)}, ${Math.min(255, rgb.b + 20)}, 1)`
    );
    root.style.setProperty(
      '--color-accent-strong',
      `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 1)`
    );
    root.style.setProperty('--color-accent-ghost', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`);
  }

  root.style.setProperty('--font-size', `${fontSize}px`);
  root.style.fontSize = `${fontSize}px`;

  // push theme CSS vars to PiP windows
  const themeVars = {
    '--color-bg-base': palette.bgBase,
    '--color-bg-surface': palette.bgSurface,
    '--color-bg-overlay': palette.bgOverlay,
    '--color-bg-elevated': palette.bgElevated,
    '--color-bg-hover': palette.bgHover,
    '--color-bg-active': palette.bgActive,
    '--color-border-default': palette.borderDefault,
    '--color-border-subtle': palette.borderSubtle,
    '--color-fg-base': palette.fgBase,
    '--color-fg-muted': palette.fgMuted,
    '--color-fg-faint': palette.fgFaint,
    '--color-accent-base': accent,
    '--color-accent-hover': rgb
      ? `rgba(${Math.min(255, rgb.r + 20)}, ${Math.min(255, rgb.g + 20)}, ${Math.min(255, rgb.b + 20)}, 1)`
      : accent,
    '--color-accent-strong': rgb
      ? `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)}, 1)`
      : accent,
    '--color-accent-ghost': rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)` : 'transparent',
    '--font-size': `${fontSize}px`
  };
  window.api?.send('audio-pip:theme', themeVars);
  window.api?.send('pip:theme', themeVars);
  window.api?.send('pip:locale', settings.appearance.locale);
}

onMounted(async () => {
  document.addEventListener('keydown', onGlobalKeydown);
  document.addEventListener('mousedown', onGlobalMouseDown);
  await settings.load();
  applyTheme();
  locale.value = settings.appearance.locale;
  library.loadFromDisk();
  if (!moduleManager.getActive()) {
    moduleManager.switchTo('home');
  }
  audioPip.mode.value = settings.appearance.audioPipMode;
  audioPip.setAutoShow(settings.appearance.audioPipAutoShow);

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
});

onBeforeUnmount(() => {
  moduleManager.deactivateAll();
  document.removeEventListener('keydown', onGlobalKeydown);
  document.removeEventListener('mousedown', onGlobalMouseDown);
});

watch(() => settings.appearance.theme, applyTheme);
watch(() => settings.appearance.accentColor, applyTheme);
watch(() => settings.appearance.fontSize, applyTheme);
watch(
  () => settings.appearance.locale,
  (loc) => {
    locale.value = loc;
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
