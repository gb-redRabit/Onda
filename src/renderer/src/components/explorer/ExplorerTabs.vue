<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { FolderOpen, Monitor, X, Plus } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useSettingsStore } from '@renderer/stores/settings';
import {
  beginTabDrag,
  claimTabDrag,
  getActiveTabDrag,
  clearTabDrag
} from '@renderer/utils/tabDrag';
import { encodeTabPayload, parseTabPayload, handleTabDrop } from '@renderer/utils/explorerTabDrop';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';

const explorer = useExplorerStore();
const settings = useSettingsStore();
const route = useRoute();
const { t } = useI18n();
const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async () => true);

const isExplorerWindow = computed(() => route.name === 'explorer-window');

const tabDropTargetIdx = ref(-1);
const tabDragEnterCount = ref(0);
const tabDropTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const isDraggingTab = ref(false);
const draggingTabIdx = ref(-1);

function tabIcon(tab: { path: string }) {
  return tab.path ? FolderOpen : Monitor;
}

function onTabAuxClick(e: MouseEvent, idx: number) {
  if (e.button === 1) {
    e.preventDefault();
    explorer.closeTab(idx);
  }
}

function onTabMouseDown(e: MouseEvent) {
  if (e.button === 1) e.preventDefault();
}

function onTabDragStart(e: DragEvent, idx: number) {
  const tab = explorer.tabs[idx];
  if (!tab) return;
  isDraggingTab.value = true;
  draggingTabIdx.value = idx;
  beginTabDrag(tab.path);
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', encodeTabPayload(window.api?.windowId ?? 0, tab.path));
    e.dataTransfer.effectAllowed = 'move';
  }
}

function onTabDragEnd() {
  isDraggingTab.value = false;
  draggingTabIdx.value = -1;
  tabDropTargetIdx.value = -1;
  tabDragEnterCount.value = 0;
  if (tabDropTimer.value) {
    clearTimeout(tabDropTimer.value);
    tabDropTimer.value = null;
  }
  const drag = getActiveTabDrag();
  if (!drag || drag.claimed) {
    clearTabDrag();
    return;
  }
  setTimeout(() => {
    const current = getActiveTabDrag();
    clearTabDrag();
    if (!current || current.claimed) return;
    window.api?.invoke('explorer:create', current.path);
    removeTabByPath(current.path);
  }, 200);
}

function removeTabByPath(path: string) {
  const idx = explorer.tabs.findIndex((tab) => tab.path === path);
  if (idx < 0) return;
  if (explorer.tabs.length <= 1) {
    if (isExplorerWindow.value) {
      window.api?.invoke('window:close');
    } else {
      explorer.navigateTo('');
    }
    return;
  }
  explorer.closeTab(idx);
}

function onTabDragOver(e: DragEvent, idx: number) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
  tabDropTargetIdx.value = idx;
  if (isDraggingTab.value) return;
  if (idx !== explorer.activeTabIndex && tabDropTimer.value === null) {
    tabDropTimer.value = setTimeout(() => {
      explorer.switchTab(idx);
      tabDropTimer.value = null;
    }, 600);
  }
}

function onTabDragEnter(_e: DragEvent, idx: number) {
  tabDropTargetIdx.value = idx;
  if (isDraggingTab.value) return;
  tabDragEnterCount.value++;
}

function onTabDragLeave() {
  if (isDraggingTab.value) {
    tabDropTargetIdx.value = -1;
    return;
  }
  tabDragEnterCount.value--;
  if (tabDragEnterCount.value <= 0) {
    tabDragEnterCount.value = 0;
    tabDropTargetIdx.value = -1;
  }
}

function getDropPaths(dt: DataTransfer | null, raw: string): string[] {
  const fromPlain = raw.split('\n').filter(Boolean);
  if (fromPlain.length > 0) return fromPlain;
  return getDroppedFilePaths(dt);
}

async function onTabDrop(e: DragEvent, idx: number) {
  e.preventDefault();
  e.stopPropagation();
  if (tabDropTimer.value) {
    clearTimeout(tabDropTimer.value);
    tabDropTimer.value = null;
  }
  tabDropTargetIdx.value = -1;
  tabDragEnterCount.value = 0;
  const raw = e.dataTransfer?.getData('text/plain') || '';
  const parsed = parseTabPayload(raw);
  if (parsed && parsed.wid === (window.api?.windowId ?? 0)) {
    claimTabDrag(parsed.path);
    if (draggingTabIdx.value >= 0 && draggingTabIdx.value !== idx) {
      explorer.reorderTab(draggingTabIdx.value, idx);
    }
    return;
  }
  if (handleTabDrop(raw)) return;
  const paths = getDropPaths(e.dataTransfer, raw);
  if (paths.length === 0) return;
  const targetPath = explorer.tabs[idx].path;
  const ctrl = e.ctrlKey || e.metaKey;
  if (settings.explorer.confirmBeforeMove) {
    const key = ctrl ? 'explorer.copyConfirm' : 'explorer.moveConfirm';
    const ok = await showConfirm(
      t(key, { n: paths.length, dir: targetPath.split('\\').pop() || targetPath })
    );
    if (!ok) return;
  }
  const method = ctrl ? 'fs:copy' : 'fs:move';
  await window.api?.invoke(method, paths, targetPath);
  explorer.loadFiles(targetPath);
  explorer.switchTab(idx);
  window.api?.send('explorer:refreshAll');
}
</script>

<template>
  <div
    v-if="explorer.tabs.length > 0"
    class="flex items-center gap-1 px-2 pt-1.5 pb-1 bg-bg-surface border-b border-border-default overflow-x-auto shrink-0"
  >
    <button
      v-for="(tab, idx) in explorer.tabs"
      :key="tab.id"
      draggable="true"
      class="group flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-md transition-colors shrink-0 min-w-0 max-w-44 border"
      :class="{
        'bg-accent-base text-white border-transparent': explorer.activeTabIndex === idx,
        'bg-bg-base text-fg-muted border-transparent hover:text-fg-base hover:bg-bg-hover':
          explorer.activeTabIndex !== idx,
        'ring-2 ring-accent-base': tabDropTargetIdx === idx
      }"
      @click="explorer.switchTab(idx)"
      @auxclick="onTabAuxClick($event, idx)"
      @mousedown="onTabMouseDown"
      @dragstart="onTabDragStart($event, idx)"
      @dragend="onTabDragEnd"
      @dragover="onTabDragOver($event, idx)"
      @dragenter="onTabDragEnter($event, idx)"
      @dragleave="onTabDragLeave"
      @drop="onTabDrop($event, idx)"
    >
      <component
        :is="tabIcon(tab)"
        :size="12"
        class="shrink-0"
        :class="explorer.activeTabIndex === idx ? 'text-white/80' : 'text-accent-base'"
      />
      <span class="truncate flex-1">{{ tab.label || $t('explorer.thisComputer') }}</span>
      <span
        class="shrink-0 p-0.5 rounded cursor-pointer hover:bg-black/20 transition-opacity"
        :class="
          explorer.activeTabIndex === idx
            ? 'text-white/80 hover:text-white opacity-100'
            : 'text-fg-faint opacity-0 group-hover:opacity-100 hover:bg-bg-hover hover:text-fg-base'
        "
        @click.stop="explorer.closeTab(idx)"
        ><X :size="10"
      /></span>
    </button>
    <button
      class="shrink-0 p-1 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
      :title="$t('nav.newTab')"
      @click="explorer.addTab(explorer.currentPath || '')"
    >
      <Plus :size="12" />
    </button>
  </div>
</template>