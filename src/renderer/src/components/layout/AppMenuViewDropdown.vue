<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import { Home, Library, FolderOpen, Globe2, Download, Settings, PanelBottom } from '@lucide/vue';
import AppMenuItem from './AppMenuItem.vue';

// Widok: nawigacja po trasach + przełącznik paska statusu. Skróty czytane z settings.
defineProps<{ shortcut: (key: string) => string }>();
defineEmits<{ navigate: [path: string] }>();

const settings = useSettingsStore();

const ROUTES: Array<{ path: string; label: string; shortcut?: string; icon: unknown }> = [
  { path: '/', label: 'menu.home', shortcut: 'home', icon: Home },
  { path: '/library', label: 'menu.library', shortcut: 'library', icon: Library },
  { path: '/explorer', label: 'menu.explorer', shortcut: 'explorer', icon: FolderOpen },
  { path: '/online', label: 'menu.online', icon: Globe2 }
];
</script>

<template>
  <div
    role="menu"
    data-menu="view"
    class="absolute top-full left-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-2xl shadow-black/40 py-2 min-w-56 z-[70]"
  >
    <AppMenuItem
      v-for="r in ROUTES"
      :key="r.path"
      :icon="r.icon"
      @click="$emit('navigate', r.path)"
      @keydown="$emit('navigate', r.path)"
    >
      {{ $t(r.label) }}
      <template v-if="r.shortcut && shortcut(r.shortcut)" #hint>{{
        shortcut(r.shortcut)
      }}</template>
    </AppMenuItem>
    <div class="border-t border-base-300 my-1.5 mx-2" role="separator" />
    <AppMenuItem :icon="Download" @click="$emit('navigate', '/downloads')">{{
      $t('menu.downloads')
    }}</AppMenuItem>
    <AppMenuItem :icon="Settings" @click="$emit('navigate', '/settings')">
      {{ $t('menu.settings') }}
      <template v-if="shortcut('settings')" #hint>{{ shortcut('settings') }}</template>
    </AppMenuItem>
    <div class="border-t border-base-300 my-1.5 mx-2" role="separator" />
    <AppMenuItem
      :icon="PanelBottom"
      @click="settings.updateStatusBar({ visible: !settings.statusBar.visible })"
      @keydown="settings.updateStatusBar({ visible: !settings.statusBar.visible })"
    >
      {{ $t('menu.statusBar') }}
      <template v-if="settings.statusBar.visible" #hint>✓</template>
    </AppMenuItem>
  </div>
</template>
