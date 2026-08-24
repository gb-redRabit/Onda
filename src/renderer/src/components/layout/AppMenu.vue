<script setup lang="ts">
import { Minus, Square, X, Search, Maximize2, FolderOpen, FileAudio } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import { useAppMenu } from '@renderer/composables/useAppMenu';
import appIcon from '@renderer/assets/icon.png';

const ui = useUIStore();

const {
  isMaximized,
  openDropdown,
  viewLabel,
  showViewActions,
  openFile,
  openFolder,
  toggleDropdown,
  closeDropdown,
  minimize,
  maximize,
  closeWin,
  quitApp,
  navigateAndClose
} = useAppMenu();
</script>

<template>
  <div
    data-app-menu
    class="flex h-9 bg-base-100/[var(--glass-alpha)] border-b border-base-300 shrink-0 select-none"
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
        </div>
      </div>
    </div>

    <!-- View-specific actions (middle area stays draggable; only buttons opt out) -->
    <div v-if="showViewActions" class="flex items-center gap-1 px-2 flex-1 min-w-0">
      <span class="text-xs font-medium text-base-content mr-2 truncate">{{ viewLabel }}</span>

      <template v-if="$route.name === 'home'">
        <button
          class="fx-noise h-7 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 fx-depth rounded-field transition-colors flex items-center gap-1.5"
          style="-webkit-app-region: no-drag"
          @click="openFile"
        >
          <FileAudio :size="12" /> {{ $t('home.openFile') }}
        </button>
        <button
          class="fx-noise h-7 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 fx-depth rounded-field transition-colors flex items-center gap-1.5"
          style="-webkit-app-region: no-drag"
          @click="openFolder"
        >
          <FolderOpen :size="12" /> {{ $t('home.openFolder') }}
        </button>
      </template>
    </div>

    <!-- Right side: search + window controls -->
    <div class="flex items-center shrink-0 ml-auto" style="-webkit-app-region: no-drag">
      <button
        class="h-9 px-3 flex items-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
        :title="$t('menu.search')"
        @click="ui.toggleCommandPalette()"
      >
        <Search :size="14" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
        @click="minimize"
      >
        <Minus :size="14" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
        @click="maximize"
      >
        <Maximize2 v-if="!isMaximized" :size="12" />
        <Square v-else :size="10" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-error/80 transition-colors text-base-content/70 hover:text-error-content"
        @click="closeWin"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>
