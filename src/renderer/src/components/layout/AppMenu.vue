<script setup lang="ts">
import { FolderOpen, FileAudio, PictureInPicture } from '@lucide/vue';
import { onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useAppMenu } from '@renderer/composables/useAppMenu';
import { getPlayerPiPHandler } from '@renderer/composables/playerPiPHandler';
import AppMenuWindowControls from './AppMenuWindowControls.vue';
import AppMenuViewActions from './AppMenuViewActions.vue';
import AppMenuHelpDropdown from './AppMenuHelpDropdown.vue';
import appIcon from '@renderer/assets/icon.png';

const settings = useSettingsStore();

const {
  isMaximized,
  openDropdown,
  viewLabel,
  showViewActions,
  viewSearchable,
  openFile,
  openFolder,
  toggleDropdown,
  closeDropdown,
  minimize,
  maximize,
  closeWin,
  quitApp,
  navigateAndClose,
  toggleViewSearch,
  navigateSettingsTab,
  actionClose,
  t,
  player
} = useAppMenu();

// A11y: menu-bar keyboard model. Each dropdown is role="menu" with
// role="menuitem" children; arrows rove focus, Escape closes and returns focus
// to the trigger, Tab dismisses.
function menuItems(name: string): HTMLElement[] {
  const el = document.querySelector<HTMLElement>(`[data-menu="${name}"]`);
  return el ? Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}
function focusTrigger(name: string): void {
  document.querySelector<HTMLElement>(`[data-menu-trigger="${name}"]`)?.focus();
}
async function openMenu(name: string): Promise<void> {
  openDropdown.value = name;
  await nextTick();
  menuItems(name)[0]?.focus();
}
function onMenuKeydown(e: KeyboardEvent): void {
  const name = openDropdown.value;
  if (!name) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    openDropdown.value = null;
    focusTrigger(name);
    return;
  }
  if (e.key === 'Tab') {
    openDropdown.value = null;
    return;
  }
  const items = menuItems(name);
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = current;
  if (e.key === 'ArrowDown') next = (current + 1 + items.length) % items.length;
  else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = items.length - 1;
  else return;
  e.preventDefault();
  items[next]?.focus();
}
function restorePip(): void {
  void window.api?.pipRestore();
  closeDropdown();
}

const shortcut = (key: string): string => settings.shortcuts[key] ?? '';

onMounted(() => document.addEventListener('keydown', onMenuKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onMenuKeydown));
</script>

<template>
  <div
    data-app-menu
    role="menubar"
    class="relative z-40 flex h-9 bg-base-100/(--glass-alpha) border border-b border-base-300 shrink-0 select-none"
    style="-webkit-app-region: drag"
  >
    <!-- Logo + static menus -->
    <div class="flex items-center shrink-0" style="-webkit-app-region: no-drag">
      <div class="flex items-center gap-2 px-3">
        <img :src="appIcon" alt="Onda Logo" class="w-5 h-5 object-contain" />
      </div>

      <!-- File -->
      <div class="relative">
        <button
          class="h-9 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          :class="{ 'bg-primary/10 text-primary': openDropdown === 'file' }"
          aria-haspopup="true"
          :aria-expanded="openDropdown === 'file'"
          data-menu-trigger="file"
          @click="toggleDropdown('file')"
          @keydown.down.prevent="openMenu('file')"
          @mouseenter="openDropdown && (openDropdown = 'file')"
        >
          {{ $t('menu.file') }}
        </button>
        <div
          v-if="openDropdown === 'file'"
          role="menu"
          data-menu="file"
          class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-48 z-[70]"
          @keydown="onMenuKeydown"
        >
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              openFile();
              closeDropdown();
            "
          >
            <FileAudio :size="13" /> {{ $t('menu.openFile') }}
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              openFolder();
              closeDropdown();
            "
          >
            <FolderOpen :size="13" /> {{ $t('menu.openFolder') }}
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
            @click="
              quitApp();
              closeDropdown();
            "
          >
            {{ $t('menu.close') }}
          </button>
        </div>
      </div>

      <!-- View -->
      <div class="relative">
        <button
          class="h-9 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          :class="{ 'bg-primary/10 text-primary': openDropdown === 'view' }"
          aria-haspopup="true"
          :aria-expanded="openDropdown === 'view'"
          data-menu-trigger="view"
          @click="toggleDropdown('view')"
          @keydown.down.prevent="openMenu('view')"
          @mouseenter="openDropdown && (openDropdown = 'view')"
        >
          {{ $t('menu.view') }}
        </button>
        <div
          v-if="openDropdown === 'view'"
          role="menu"
          data-menu="view"
          class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-48 z-[70]"
          @keydown="onMenuKeydown"
        >
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/');
              closeDropdown();
            "
          >
            {{ $t('menu.home') }}
            <span
              v-if="shortcut('home')"
              class="ml-auto text-[10px] text-base-content/50 font-mono"
              >{{ shortcut('home') }}</span
            >
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/library');
              closeDropdown();
            "
          >
            {{ $t('menu.library') }}
            <span
              v-if="shortcut('library')"
              class="ml-auto text-[10px] text-base-content/50 font-mono"
              >{{ shortcut('library') }}</span
            >
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/explorer');
              closeDropdown();
            "
          >
            {{ $t('menu.explorer') }}
            <span
              v-if="shortcut('explorer')"
              class="ml-auto text-[10px] text-base-content/50 font-mono"
              >{{ shortcut('explorer') }}</span
            >
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/online');
              closeDropdown();
            "
          >
            {{ $t('menu.online') }}
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/downloads');
              closeDropdown();
            "
          >
            {{ $t('menu.downloads') }}
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/settings');
              closeDropdown();
            "
          >
            {{ $t('menu.settings') }}
            <span
              v-if="shortcut('settings')"
              class="ml-auto text-[10px] text-base-content/50 font-mono"
              >{{ shortcut('settings') }}</span
            >
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              settings.updateStatusBar({ visible: !settings.statusBar.visible });
              closeDropdown();
            "
          >
            {{ $t('menu.statusBar') }}
            <span v-if="settings.statusBar.visible" class="ml-auto text-primary">✓</span>
          </button>
        </div>
      </div>

      <!-- Playback -->
      <div v-if="player.currentTrack" class="relative">
        <button
          class="h-9 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          :class="{ 'bg-primary/10 text-primary': openDropdown === 'playback' }"
          aria-haspopup="true"
          :aria-expanded="openDropdown === 'playback'"
          data-menu-trigger="playback"
          @click="toggleDropdown('playback')"
          @keydown.down.prevent="openMenu('playback')"
          @mouseenter="openDropdown && (openDropdown = 'playback')"
        >
          {{ $t('menu.playback') }}
        </button>
        <div
          v-if="openDropdown === 'playback'"
          role="menu"
          data-menu="playback"
          class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-52 z-[70]"
          @keydown="onMenuKeydown"
        >
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="actionClose(player.togglePlay)"
          >
            {{ t('menu.playPause') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">{{
              $t(player.isPlaying ? 'common.pause' : 'common.play')
            }}</span>
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
            @click="actionClose(player.nextTrack)"
          >
            {{ t('menu.nextTrack') }}
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
            @click="actionClose(player.prevTrack)"
          >
            {{ t('menu.prevTrack') }}
          </button>
          <button
            v-if="
              player.currentTrack.type === 'video' && !player.pipActive && getPlayerPiPHandler()
            "
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              getPlayerPiPHandler()?.();
              closeDropdown();
            "
          >
            <PictureInPicture :size="13" /> {{ t('menu.picInPic') }}
          </button>
          <button
            v-if="player.currentTrack?.type === 'video' && player.pipActive"
            role="menuitem"
            tabindex="-1"
            data-testid="menu-return-pip"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="restorePip"
          >
            <PictureInPicture :size="13" /> {{ t('menu.returnFromPip') }}
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="actionClose(player.toggleShuffle)"
          >
            {{ t('menu.shuffle') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">{{
              $t(player.shuffle ? 'common.on' : 'common.off')
            }}</span>
          </button>
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="actionClose(player.cycleRepeat)"
          >
            {{ t('menu.repeat') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">{{
              $t(
                player.repeat === 'none'
                  ? 'player.repeatNone'
                  : player.repeat === 'one'
                    ? 'player.repeatOne'
                    : 'player.repeatAll'
              )
            }}</span>
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            role="menuitem"
            tabindex="-1"
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
            @click="actionClose(player.toggleEqualizer)"
          >
            {{ t('menu.eq') }}
          </button>
        </div>
      </div>

      <!-- Help -->
      <div class="relative">
        <button
          class="h-9 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
          :class="{ 'bg-primary/10 text-primary': openDropdown === 'help' }"
          aria-haspopup="true"
          :aria-expanded="openDropdown === 'help'"
          data-menu-trigger="help"
          @click="toggleDropdown('help')"
          @keydown.down.prevent="openMenu('help')"
          @mouseenter="openDropdown && (openDropdown = 'help')"
        >
          {{ $t('menu.help') }}
        </button>
        <AppMenuHelpDropdown
          v-if="openDropdown === 'help'"
          @about="navigateSettingsTab('about')"
          @shortcuts="navigateSettingsTab('shortcuts')"
        />
      </div>
    </div>

    <!-- View-specific actions (middle area stays draggable; only buttons opt out) -->
    <AppMenuViewActions
      :show="showViewActions"
      :label="viewLabel"
      :searchable="viewSearchable"
      @open-file="openFile"
      @open-folder="openFolder"
      @search="toggleViewSearch"
    />

    <!-- Right side: search + window controls -->
    <AppMenuWindowControls
      :is-maximized="isMaximized"
      @minimize="minimize"
      @maximize="maximize"
      @close="closeWin"
    />
  </div>
</template>
