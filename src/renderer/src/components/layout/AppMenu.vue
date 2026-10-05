<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import { useAppMenu } from '@renderer/composables/useAppMenu';
import { onMounted, onBeforeUnmount, nextTick } from 'vue';
import AppMenuFileDropdown from './AppMenuFileDropdown.vue';
import AppMenuViewDropdown from './AppMenuViewDropdown.vue';
import AppMenuPlaybackDropdown from './AppMenuPlaybackDropdown.vue';
import AppMenuHelpDropdown from './AppMenuHelpDropdown.vue';
import AppMenuWindowControls from './AppMenuWindowControls.vue';
import AppMenuViewActions from './AppMenuViewActions.vue';
import appIcon from '@renderer/assets/icon.png';

const settings = useSettingsStore();
const player = usePlayerStore();

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
  actionClose
} = useAppMenu();

// A11y: model klawiaturowy paska menu. Każdy dropdown to role="menu" z
// dziećmi role="menuitem"; strzałki przenoszą fokus, Escape zamyka i przywraca fokus
// do wyzwalacza, Tab odrzuca.
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
  let next: number;
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
    <div class="flex items-center shrink-0" style="-webkit-app-region: no-drag">
      <div class="flex items-center gap-2 px-3">
        <img :src="appIcon" alt="Onda Logo" class="w-5 h-5 object-contain" />
      </div>

      <!-- Plik -->
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
        <AppMenuFileDropdown
          v-if="openDropdown === 'file'"
          @keydown="onMenuKeydown"
          @open-file="
            openFile();
            closeDropdown();
          "
          @open-folder="
            openFolder();
            closeDropdown();
          "
          @quit="
            quitApp();
            closeDropdown();
          "
        />
      </div>

      <!-- Widok -->
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
        <AppMenuViewDropdown
          v-if="openDropdown === 'view'"
          :shortcut="shortcut"
          @keydown="onMenuKeydown"
          @navigate="
            navigateAndClose($event);
            closeDropdown();
          "
        />
      </div>

      <!-- Odtwarzanie -->
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
        <AppMenuPlaybackDropdown
          v-if="openDropdown === 'playback'"
          :action="actionClose"
          @keydown="onMenuKeydown"
          @restore-pip="restorePip"
          @close="closeDropdown"
        />
      </div>

      <!-- Pomoc -->
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
          @keydown="onMenuKeydown"
          @about="navigateSettingsTab('about')"
          @shortcuts="navigateSettingsTab('shortcuts')"
        />
      </div>
    </div>

    <AppMenuViewActions
      :show="showViewActions"
      :label="viewLabel"
      :searchable="viewSearchable"
      @open-file="openFile"
      @open-folder="openFolder"
      @search="toggleViewSearch"
    />

    <AppMenuWindowControls
      :is-maximized="isMaximized"
      @minimize="minimize"
      @maximize="maximize"
      @close="closeWin"
    />
  </div>
</template>
