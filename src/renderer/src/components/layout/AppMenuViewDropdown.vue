<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import AppMenuItem from './AppMenuItem.vue';

// Widok: nawigacja po trasach + przełącznik paska statusu. Skróty czytane z settings.
defineProps<{ shortcut: (key: string) => string }>();
defineEmits<{ navigate: [path: string] }>();

const settings = useSettingsStore();

const ROUTES: Array<{ path: string; label: string; shortcut?: string }> = [
  { path: '/', label: 'menu.home', shortcut: 'home' },
  { path: '/library', label: 'menu.library', shortcut: 'library' },
  { path: '/explorer', label: 'menu.explorer', shortcut: 'explorer' },
  { path: '/online', label: 'menu.online' }
];
</script>

<template>
  <div
    role="menu"
    data-menu="view"
    class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-48 z-[70]"
  >
    <AppMenuItem
      v-for="r in ROUTES"
      :key="r.path"
      @click="$emit('navigate', r.path)"
      @keydown="$emit('navigate', r.path)"
    >
      {{ $t(r.label) }}
      <template v-if="r.shortcut && shortcut(r.shortcut)" #hint>{{
        shortcut(r.shortcut)
      }}</template>
    </AppMenuItem>
    <AppMenuItem @click="$emit('navigate', '/downloads')">{{ $t('menu.downloads') }}</AppMenuItem>
    <div class="border-t border-base-300 my-1 mx-2" />
    <AppMenuItem @click="$emit('navigate', '/settings')">
      {{ $t('menu.settings') }}
      <template v-if="shortcut('settings')" #hint>{{ shortcut('settings') }}</template>
    </AppMenuItem>
    <div class="border-t border-base-300 my-1 mx-2" />
    <AppMenuItem
      @click="settings.updateStatusBar({ visible: !settings.statusBar.visible })"
      @keydown="settings.updateStatusBar({ visible: !settings.statusBar.visible })"
    >
      {{ $t('menu.statusBar') }}
      <template v-if="settings.statusBar.visible" #hint>✓</template>
    </AppMenuItem>
  </div>
</template>
