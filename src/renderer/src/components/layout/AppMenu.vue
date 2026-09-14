<script setup lang="ts">
import { FolderOpen, FileAudio, PictureInPicture } from '@lucide/vue';
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
</script>

<template>
  <div
    data-app-menu
    class="flex h-9 bg-base-100/(--glass-alpha) border border-b border-base-300 shrink-0 select-none"
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
          @click="toggleDropdown('file')"
          @mouseenter="openDropdown && (openDropdown = 'file')"
        >
          {{ $t('menu.file') }}
        </button>
        <div
          v-if="openDropdown === 'file'"
          class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-48 z-50"
        >
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              openFile();
              closeDropdown();
            "
          >
            <FileAudio :size="13" /> {{ $t('menu.openFile') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Ctrl+O</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              openFolder();
              closeDropdown();
            "
          >
            <FolderOpen :size="13" /> {{ $t('menu.openFolder') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Ctrl+Shift+O</span>
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
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
          @click="toggleDropdown('view')"
          @mouseenter="openDropdown && (openDropdown = 'view')"
        >
          {{ $t('menu.view') }}
        </button>
        <div
          v-if="openDropdown === 'view'"
          class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-48 z-50"
        >
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/');
              closeDropdown();
            "
          >
            {{ $t('menu.home') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Alt+1</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/library');
              closeDropdown();
            "
          >
            {{ $t('menu.library') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Alt+2</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/explorer');
              closeDropdown();
            "
          >
            {{ $t('menu.explorer') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Alt+3</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/online');
              closeDropdown();
            "
          >
            {{ $t('menu.online') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Alt+4</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/downloads');
              closeDropdown();
            "
          >
            {{ $t('menu.downloads') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Alt+5</span>
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              navigateAndClose('/settings');
              closeDropdown();
            "
          >
            {{ $t('menu.settings') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">Alt+6</span>
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
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
          @click="toggleDropdown('playback')"
          @mouseenter="openDropdown && (openDropdown = 'playback')"
        >
          {{ $t('menu.playback') }}
        </button>
        <div
          v-if="openDropdown === 'playback'"
          class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-52 z-50"
        >
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="actionClose(player.togglePlay)"
          >
            {{ t('menu.playPause') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">{{
              player.isPlaying ? 'Pause' : 'Play'
            }}</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
            @click="actionClose(player.nextTrack)"
          >
            {{ t('menu.nextTrack') }}
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
            @click="actionClose(player.prevTrack)"
          >
            {{ t('menu.prevTrack') }}
          </button>
          <button
            v-if="
              player.currentTrack.type === 'video' && !player.pipActive && getPlayerPiPHandler()
            "
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="
              getPlayerPiPHandler()?.();
              closeDropdown();
            "
          >
            <PictureInPicture :size="13" /> {{ t('menu.picInPic') }}
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="actionClose(player.toggleShuffle)"
          >
            {{ t('menu.shuffle') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">{{
              player.shuffle ? 'On' : 'Off'
            }}</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            @click="actionClose(player.cycleRepeat)"
          >
            {{ t('menu.repeat') }}
            <span class="ml-auto text-[10px] text-base-content/50 font-mono">{{
              player.repeat
            }}</span>
          </button>
          <div class="border-t border-base-300 my-1 mx-2" />
          <button
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
          @click="toggleDropdown('help')"
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
