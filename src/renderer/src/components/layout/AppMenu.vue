<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUIStore } from '@renderer/stores/ui';
import { useI18n } from 'vue-i18n';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';
import { Minus, Square, X, Search, Music2, Maximize2, FolderOpen, FileAudio } from '@lucide/vue';

const route = useRoute();
const router = useRouter();
const ui = useUIStore();
const { t } = useI18n();
const isMaximized = ref(false);
const openDropdown = ref<string | null>(null);
const menuBar = ref<HTMLElement | null>(null);

function onClickAway(e: MouseEvent) {
  if (!openDropdown.value) return;
  if (!menuBar.value?.contains(e.target as Node)) closeDropdown();
}

onMounted(() => document.addEventListener('click', onClickAway));
onUnmounted(() => document.removeEventListener('click', onClickAway));

const viewLabel = computed(() => {
  const map: Record<string, string> = {
    home: t('nav.home'),
    library: t('nav.library'),
    player: t('nav.player'),
    audio: t('nav.player'),
    settings: t('nav.settings')
  };
  return map[route.name as string] || '';
});

const showViewActions = computed(() =>
  ['home', 'library', 'player', 'audio', 'settings'].includes(route.name as string)
);

async function openFile() {
  const result = (await window.api.invoke('dialog:openFile')) as {
    filePaths: string[];
    canceled: boolean;
  };
  if (result.canceled || !result.filePaths.length) return;
  await openMediaFiles(result.filePaths, router);
}

async function openFolder() {
  const result = (await window.api.invoke('dialog:openFolderFiles')) as {
    filePaths: string[];
    canceled: boolean;
  };
  if (result.canceled || !result.filePaths.length) return;
  await openMediaFiles(result.filePaths, router);
}

function toggleDropdown(name: string) {
  openDropdown.value = openDropdown.value === name ? null : name;
}

function closeDropdown() {
  openDropdown.value = null;
}

function minimize() {
  window.api.invoke('window:minimize');
}
function maximize() {
  window.api.invoke('window:maximize');
}
function closeWin() {
  window.api.invoke('window:close');
}
function quitApp() {
  window.api.invoke('app:quit');
}

function onKeydown(e: KeyboardEvent) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const map: Record<string, string> = {
    '1': '/',
    '2': '/library',
    '3': '/explorer',
    '4': '/youtube',
    '5': '/downloads',
    '6': '/settings'
  };
  const path = map[e.key];
  if (path) {
    e.preventDefault();
    router.push(path);
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

window.api.on('window:maximized', (val: unknown) => {
  isMaximized.value = val as boolean;
});
</script>

<template>
  <div
    ref="menuBar"
    class="flex h-9 bg-bg-surface border-b border-border-default shrink-0 select-none"
    style="-webkit-app-region: drag"
  >
    <!-- Logo + static menus -->
    <div class="flex items-center shrink-0" style="-webkit-app-region: no-drag">
      <div class="flex items-center gap-2 px-3">
        <div
          class="w-5 h-5 rounded-md flex items-center justify-center bg-linear-to-br from-accent-base to-purple-400"
        >
          <Music2 :size="11" class="text-white" />
        </div>
      </div>

      <!-- File -->
      <div class="relative">
        <button
          class="h-9 px-2.5 text-xs text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          :class="{ 'bg-accent-ghost text-accent-base': openDropdown === 'file' }"
          @click="toggleDropdown('file')"
          @mouseenter="openDropdown && (openDropdown = 'file')"
        >
          {{ t('menu.file') }}
        </button>
        <div
          v-if="openDropdown === 'file'"
          class="absolute top-full left-0 mt-0.5 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/40 py-1.5 min-w-48 z-50"
        >
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              openFile();
              closeDropdown();
            "
          >
            <FileAudio :size="13" /> {{ t('menu.openFile') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Ctrl+O</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              openFolder();
              closeDropdown();
            "
          >
            <FolderOpen :size="13" /> {{ t('menu.openFolder') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Ctrl+Shift+O</span>
          </button>
          <div class="border-t border-border-default my-1 mx-2" />
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors"
            @click="
              quitApp();
              closeDropdown();
            "
          >
            {{ t('menu.close') }}
          </button>
        </div>
      </div>

      <!-- View -->
      <div class="relative">
        <button
          class="h-9 px-2.5 text-xs text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
          :class="{ 'bg-accent-ghost text-accent-base': openDropdown === 'view' }"
          @click="toggleDropdown('view')"
          @mouseenter="openDropdown && (openDropdown = 'view')"
        >
          {{ t('menu.view') }}
        </button>
        <div
          v-if="openDropdown === 'view'"
          class="absolute top-full left-0 mt-0.5 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/40 py-1.5 min-w-48 z-50"
        >
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              router.push('/');
              closeDropdown();
            "
          >
            {{ t('menu.home') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Alt+1</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              router.push('/library');
              closeDropdown();
            "
          >
            {{ t('menu.library') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Alt+2</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              router.push('/explorer');
              closeDropdown();
            "
          >
            {{ t('menu.explorer') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Alt+3</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              router.push('/youtube');
              closeDropdown();
            "
          >
            {{ t('menu.youtube') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Alt+4</span>
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              router.push('/downloads');
              closeDropdown();
            "
          >
            {{ t('menu.downloads') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Alt+5</span>
          </button>
          <div class="border-t border-border-default my-1 mx-2" />
          <button
            class="w-full px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
            @click="
              router.push('/settings');
              closeDropdown();
            "
          >
            {{ t('menu.settings') }}
            <span class="ml-auto text-[10px] text-fg-faint font-mono">Alt+6</span>
          </button>
        </div>
      </div>
    </div>

    <!-- View-specific actions (middle area stays draggable; only buttons opt out) -->
    <div v-if="showViewActions" class="flex items-center gap-1 px-2 flex-1 min-w-0">
      <span class="text-xs font-medium text-fg-base mr-2 truncate">{{ viewLabel }}</span>

      <template v-if="route.name === 'home'">
        <button
          class="h-7 px-2.5 text-xs text-fg-muted hover:text-fg-base hover:bg-bg-hover rounded-md transition-colors flex items-center gap-1.5"
          style="-webkit-app-region: no-drag"
          @click="openFile"
        >
          <FileAudio :size="12" /> {{ t('home.openFile') }}
        </button>
        <button
          class="h-7 px-2.5 text-xs text-fg-muted hover:text-fg-base hover:bg-bg-hover rounded-md transition-colors flex items-center gap-1.5"
          style="-webkit-app-region: no-drag"
          @click="openFolder"
        >
          <FolderOpen :size="12" /> {{ t('home.openFolder') }}
        </button>
      </template>
    </div>

    <!-- Right side: search + window controls -->
    <div class="flex items-center shrink-0 ml-auto" style="-webkit-app-region: no-drag">
      <button
        class="h-9 px-3 flex items-center hover:bg-bg-hover transition-colors text-fg-muted hover:text-fg-base"
        :title="t('menu.search')"
        @click="ui.toggleCommandPalette()"
      >
        <Search :size="14" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-bg-hover transition-colors text-fg-muted hover:text-fg-base"
        @click="minimize"
      >
        <Minus :size="14" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-bg-hover transition-colors text-fg-muted hover:text-fg-base"
        @click="maximize"
      >
        <Maximize2 v-if="!isMaximized" :size="12" />
        <Square v-else :size="10" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-red-base/80 transition-colors text-fg-muted hover:text-white"
        @click="closeWin"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>
