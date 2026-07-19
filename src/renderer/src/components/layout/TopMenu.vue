<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';

const router = useRouter();

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

const menus = [
  {
    label: 'Plik',
    items: [
      { label: 'Otwórz plik', shortcut: 'Ctrl+O', action: openFiles },
      {
        label: 'Otwórz folder',
        shortcut: 'Ctrl+Shift+O',
        action: openFolder
      },
      { sep: true },
      { label: 'Zamknij', shortcut: 'Alt+F4', action: () => window.api.invoke('app:quit') }
    ]
  },
  {
    label: 'Widok',
    items: [
      { label: 'Strona główna', action: () => router.push('/') },
      { label: 'Biblioteka', action: () => router.push('/library') },
      { label: 'Eksplorator', action: () => router.push('/explorer') },
      { label: 'YouTube', action: () => router.push('/youtube') },
      { sep: true },
      { label: 'Ustawienia', shortcut: 'Ctrl+,', action: () => router.push('/settings') }
    ]
  },
  {
    label: 'Odtwarzanie',
    items: [
      { label: 'Odtwórz / Pauza', shortcut: 'Space' },
      { label: 'Następny utwór' },
      { label: 'Poprzedni utwór' },
      { sep: true },
      { label: 'Losowo' },
      { label: 'Powtarzanie' }
    ]
  },
  {
    label: 'Pomoc',
    items: [
      {
        label: 'Dokumentacja',
        action: () => window.api.invoke('shell:openExternal', 'https://electron-vite.org')
      },
      { sep: true },
      { label: 'O Onda' }
    ]
  }
];

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
    <div v-for="(menu, idx) in menus" :key="menu.label" class="relative">
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
