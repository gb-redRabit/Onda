<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Minus,
  Square,
  X,
  Search,
  Music2,
  Maximize2,
  Plus,
  X as XIcon,
  XCircle,
  FileX,
  Copy
} from '@lucide/vue';

const router = useRouter();
const route = useRoute();
const isMaximized = ref(false);
const tabMenuVisible = ref(false);
const tabMenuPos = ref({ x: 0, y: 0 });
const tabMenuTab = ref<string | null>(null);

interface Tab {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const tabs = ref<Tab[]>([{ id: 'home', label: 'Strona główna', icon: 'home', path: '/' }]);

const activeTabId = computed(() => {
  const t = tabs.value.find((t) => t.path === route.path);
  return t?.id || tabs.value[0]?.id;
});

const routeLabels: Record<string, string> = {
  '/': 'Strona główna',
  '/library': 'Biblioteka',
  '/explorer': 'Eksplorator',
  '/youtube': 'YouTube',
  '/downloads': 'Pobrane',
  '/settings': 'Ustawienia',
  '/search': 'Szukaj',
  '/player': 'Odtwarzacz'
};

function addTab() {
  const path = route.path || '/';
  const exists = tabs.value.find((t) => t.path === path);
  if (!exists) {
    tabs.value.push({
      id: `tab-${Date.now()}`,
      label: routeLabels[path] || 'Karta',
      icon: (route.meta?.icon as string) || 'home',
      path
    });
  }
}

function closeTab(id: string, e?: MouseEvent) {
  e?.stopPropagation();
  const idx = tabs.value.findIndex((t) => t.id === id);
  if (idx < 0) return;
  tabs.value.splice(idx, 1);
  if (tabs.value.length === 0) {
    tabs.value.push({ id: 'home', label: 'Strona główna', icon: 'home', path: '/' });
  }
  if (activeTabId.value === id) {
    router.push(tabs.value[Math.min(idx, tabs.value.length - 1)].path);
  }
}

function closeOtherTabs(id: string) {
  tabs.value = tabs.value.filter((t) => t.id === id);
  if (!tabs.value.find((t) => t.path === route.path)) {
    router.push(tabs.value[0].path);
  }
}

function closeAllTabs() {
  tabs.value = [{ id: 'home', label: 'Strona główna', icon: 'home', path: '/' }];
  router.push('/');
}

function duplicateTab(tab: Tab) {
  const exists = tabs.value.find((t) => t.path === tab.path);
  if (!exists) {
    tabs.value.push({ ...tab, id: `tab-${Date.now()}` });
  }
}

function selectTab(tab: Tab) {
  router.push(tab.path);
}

function showTabMenu(e: MouseEvent, tab: Tab) {
  e.preventDefault();
  e.stopPropagation();
  tabMenuVisible.value = true;
  tabMenuPos.value = { x: e.clientX, y: e.clientY };
  tabMenuTab.value = tab.id;
}

function closeTabMenu() {
  tabMenuVisible.value = false;
  tabMenuTab.value = null;
}

function minimize() {
  window.api.invoke('window:minimize');
}
function maximize() {
  window.api.invoke('window:maximize');
  isMaximized.value = !isMaximized.value;
}
function close() {
  window.api.invoke('window:close');
}

window.api.on('window:maximized', (val: unknown) => {
  isMaximized.value = val as boolean;
});
</script>

<template>
  <div
    class="flex h-9 bg-bg-surface border-b border-border-default shrink-0 select-none"
    style="-webkit-app-region: drag"
  >
    <!-- app icon -->
    <div class="flex items-center gap-2 px-3 shrink-0">
      <div
        class="w-5 h-5 rounded-md flex items-center justify-center bg-linear-to-br from-accent-base to-purple-400"
      >
        <Music2 :size="11" class="text-white" />
      </div>
    </div>

    <!-- tabs -->
    <div
      class="flex items-end h-full gap-0.5 overflow-x-auto flex-1 min-w-0"
      style="-webkit-app-region: no-drag"
    >
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="flex items-center gap-2 h-8 px-3 text-xs rounded-t-lg transition-colors cursor-pointer group max-w-40 min-w-20"
        :class="
          activeTabId === tab.id
            ? 'bg-bg-base text-fg-base'
            : 'text-fg-faint hover:text-fg-muted hover:bg-bg-hover'
        "
        @click="selectTab(tab)"
        @contextmenu="showTabMenu($event, tab)"
      >
        <span class="truncate flex-1">{{ tab.label }}</span>
        <button
          v-if="tabs.length > 1"
          class="shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-bg-active transition-all"
          @click="closeTab(tab.id, $event)"
        >
          <XIcon :size="10" />
        </button>
      </div>
      <button
        class="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-fg-faint hover:text-fg-muted hover:bg-bg-hover transition-colors mb-0.5"
        style="-webkit-app-region: no-drag"
        @click="addTab"
      >
        <Plus :size="14" />
      </button>
    </div>

    <!-- search + window controls -->
    <div class="flex items-center shrink-0" style="-webkit-app-region: no-drag">
      <button
        class="h-9 px-3 flex items-center hover:bg-bg-hover transition-colors"
        @click="router.push('/search')"
      >
        <Search :size="14" class="text-fg-muted" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-bg-hover transition-colors"
        @click="minimize"
      >
        <Minus :size="14" class="text-fg-muted" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-bg-hover transition-colors"
        @click="maximize"
      >
        <Maximize2 v-if="!isMaximized" :size="12" class="text-fg-muted" />
        <Square v-else :size="10" class="text-fg-muted" />
      </button>
      <button
        class="h-9 w-11 flex items-center justify-center hover:bg-red-base/80 transition-colors"
        @click="close"
      >
        <X :size="14" class="text-fg-muted hover:text-white" />
      </button>
    </div>
  </div>

  <!-- tab context menu -->
  <Teleport to="body">
    <div
      v-if="tabMenuVisible"
      class="fixed inset-0 z-50"
      @click="closeTabMenu"
      @contextmenu.prevent="closeTabMenu"
    >
      <div
        class="absolute bg-bg-elevated border border-border-default rounded-xl shadow-2xl shadow-black/50 py-1.5 min-w-45"
        :style="{ left: tabMenuPos.x + 'px', top: tabMenuPos.y + 'px' }"
        @click.stop
      >
        <button
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          @click="
            addTab();
            closeTabMenu();
          "
        >
          <Plus :size="13" /> Nowa karta
        </button>
        <button
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          @click="
            tabMenuTab && duplicateTab(tabs.find((x) => x.id === tabMenuTab)!);
            closeTabMenu();
          "
        >
          <Copy :size="13" /> Duplikuj
        </button>
        <div class="border-t border-border-default my-1 mx-2" />
        <button
          v-if="tabs.length > 1"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          @click="
            tabMenuTab && closeTab(tabMenuTab);
            closeTabMenu();
          "
        >
          <XCircle :size="13" /> Zamknij kartę
        </button>
        <button
          v-if="tabs.length > 2"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-accent-ghost hover:text-accent-base transition-colors flex items-center gap-2"
          @click="
            tabMenuTab && closeOtherTabs(tabMenuTab);
            closeTabMenu();
          "
        >
          <FileX :size="13" /> Zamknij pozostałe
        </button>
        <button
          v-if="tabs.length > 1"
          class="w-full px-3 py-1.5 text-left text-sm hover:bg-red-base/80 hover:text-white transition-colors flex items-center gap-2"
          @click="
            closeAllTabs();
            closeTabMenu();
          "
        >
          <XCircle :size="13" /> Zamknij wszystkie
        </button>
      </div>
    </div>
  </Teleport>
</template>
