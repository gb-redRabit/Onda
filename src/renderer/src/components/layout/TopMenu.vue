<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';

const router = useRouter();
const { t } = useI18n();

async function openFiles() {
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

const menus = computed(() => [
  {
    label: t('menu.file'),
    items: [
      { label: t('menu.openFile'), shortcut: 'Ctrl+O', action: openFiles },
      {
        label: t('menu.openFolder'),
        shortcut: 'Ctrl+Shift+O',
        action: openFolder
      },
      { sep: true },
      { label: t('menu.close'), shortcut: 'Alt+F4', action: () => window.api.invoke('app:quit') }
    ]
  },
  {
    label: t('menu.view'),
    items: [
      { label: t('menu.home'), action: () => router.push('/') },
      { label: t('menu.library'), action: () => router.push('/library') },
      { label: t('menu.explorer'), action: () => router.push('/explorer') },
      { label: t('menu.youtube'), action: () => router.push('/youtube') },
      { sep: true },
      { label: t('menu.settings'), shortcut: 'Ctrl+,', action: () => router.push('/settings') }
    ]
  },
  {
    label: t('menu.playback'),
    items: [
      { label: t('menu.playPause'), shortcut: 'Space' },
      { label: t('menu.nextTrack') },
      { label: t('menu.prevTrack') },
      { sep: true },
      { label: t('menu.shuffle') },
      { label: t('menu.repeat') }
    ]
  },
  {
    label: t('menu.help'),
    items: [
      {
        label: t('menu.documentation'),
        action: () => window.api.invoke('shell:openExternal', 'https://electron-vite.org')
      },
      { sep: true },
      { label: t('menu.about') }
    ]
  }
]);

const openMenu = ref<number | null>(null);
function toggleMenu(i: number) {
  openMenu.value = openMenu.value === i ? null : i;
}
function closeMenu() {
  openMenu.value = null;
}
</script>

<template>
  <div
    class="h-8 flex items-center bg-bg-surface/80 border-b border-border-default px-1 text-xs shrink-0"
    @mouseleave="closeMenu"
  >
    <div v-for="(menu, idx) in menus" :key="idx" class="relative">
      <button
        class="px-2.5 py-1 rounded-md text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
        :class="{ 'bg-accent-ghost text-accent-base': openMenu === idx }"
        @click="toggleMenu(idx)"
        @mouseenter="openMenu !== null && (openMenu = idx)"
      >
        {{ menu.label }}
      </button>

      <div
        v-if="openMenu === idx"
        class="absolute top-full left-0 mt-1 bg-bg-elevated border border-border-subtle rounded-xl shadow-2xl shadow-black/40 py-1.5 min-w-50 z-50"
      >
        <template v-for="item in menu.items" :key="JSON.stringify(item)">
          <div v-if="'sep' in item" class="border-t border-border-default my-1 mx-2" />
          <button
            v-else
            class="w-full px-3 py-1.5 text-left text-fg-muted hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center justify-between gap-4"
            @click="
              'action' in item && item.action ? item.action() : null;
              closeMenu();
            "
          >
            <span>{{ item.label }}</span>
            <span
              v-if="'shortcut' in item && item.shortcut"
              class="text-[10px] text-fg-faint font-mono"
              >{{ item.shortcut }}</span
            >
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
