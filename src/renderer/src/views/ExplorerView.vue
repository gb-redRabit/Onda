<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useVirtualizer } from '@tanstack/vue-virtual';
import {
  ChevronUp, ChevronDown,
  HardDrive, FolderOpen, Plus, Pin, PinOff
} from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore, ContextMenuItem } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { SUPPORTED_IMAGE_FORMATS } from '@renderer/utils/constants';
import ExplorerNavPane from '@renderer/components/explorer/ExplorerNavPane.vue';
import ExplorerToolbar from '@renderer/components/explorer/ExplorerToolbar.vue';
import ExplorerBreadcrumb from '@renderer/components/explorer/ExplorerBreadcrumb.vue';
import ExplorerViewModeDropdown from '@renderer/components/explorer/ExplorerViewModeDropdown.vue';
import ExplorerGridItem from '@renderer/components/explorer/ExplorerGridItem.vue';
import ExplorerTableRow from '@renderer/components/explorer/ExplorerTableRow.vue';
import ImageViewer from '@renderer/components/explorer/ImageViewer.vue';
import type { FileItem } from '@renderer/types/explorer';
import type { MediaFile } from '@renderer/types/media';

const explorer = useExplorerStore();
const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();
const { t } = useI18n();

const pinned = ref(false);

function togglePin() {
  pinned.value = !pinned.value;
  window.api?.invoke('window:setAlwaysOnTop', pinned.value);
}

const IMAGE_EXTS = new Set(SUPPORTED_IMAGE_FORMATS);
const ICON_CACHE_MAX = 500;
const iconCacheOrder: string[] = [];
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v']);

const MEDIA_EXTS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.opus', '.aiff',
  '.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v',
  ...SUPPORTED_IMAGE_FORMATS
]);

const GRID_ITEM_WIDTHS: Record<string, number> = { small: 72, medium: 108, large: 160, extraLarge: 240 };
const GRID_GAPS: Record<string, number> = { small: 4, medium: 8, large: 12, extraLarge: 16 };
const GRID_ITEM_HEIGHTS: Record<string, number> = { small: 66, medium: 90, large: 118, extraLarge: 146 };
const LIST_ITEM_HEIGHTS: Record<string, number> = { extraSmall: 28, details: 36 };

const searchQuery = ref('');
const imageViewerIndex = ref<number | null>(null);
const imageViewerFiles = ref<FileItem[]>([]);
const scrollRef = ref<HTMLDivElement | null>(null);
const containerWidth = ref(800);
const selectionAnchorIndex = ref(-1);
const extraSmallIcons = shallowRef<Record<string, string>>({});

const { showPrompt, showConfirm, promptVisible, promptIsConfirm, promptMessage, promptValue, promptConfirm, promptCancel, promptKeydown } = usePromptDialog();

const filteredFiles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return explorer.sortedFiles;
  return explorer.sortedFiles.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.extension || '').toLowerCase().includes(q)
  );
});

const isListMode = computed(() => explorer.viewMode === 'extraSmall' || explorer.viewMode === 'details');
const isGridMode = computed(() => !isListMode.value);

const itemsPerRow = computed(() => {
  if (isListMode.value) return 1;
  const config = GRID_ITEM_WIDTHS[explorer.viewMode] + GRID_GAPS[explorer.viewMode];
  return Math.max(1, Math.floor((containerWidth.value + GRID_GAPS[explorer.viewMode]) / config));
});

const totalVirtualRows = computed(() => {
  if (isListMode.value) return filteredFiles.value.length;
  return Math.ceil(filteredFiles.value.length / itemsPerRow.value);
});

const virtualItemHeight = computed(() => {
  if (isListMode.value) return LIST_ITEM_HEIGHTS[explorer.viewMode];
  return GRID_ITEM_HEIGHTS[explorer.viewMode];
});

function getRowItems(rowIndex: number): FileItem[] {
  if (isListMode.value) return [filteredFiles.value[rowIndex]];
  const start = rowIndex * itemsPerRow.value;
  return filteredFiles.value.slice(start, start + itemsPerRow.value);
}

const iconPendingQueue = new Set<string>();
let iconBatchTimer: ReturnType<typeof setTimeout> | null = null;

function flushIconQueue() {
  if (iconPendingQueue.size === 0) return;
  const paths = [...iconPendingQueue];
  iconPendingQueue.clear();
  paths.forEach((path) => {
    window.api?.invoke('shell:getFileIcon', path).then((icon) => {
      if (icon) {
        const map = { ...extraSmallIcons.value };
        if (iconCacheOrder.length >= ICON_CACHE_MAX) {
          const evicted = iconCacheOrder.pop()!;
          delete map[evicted];
        }
        iconCacheOrder.unshift(path);
        map[path] = icon as string;
        extraSmallIcons.value = map;
        triggerRef(extraSmallIcons);
      }
    }).catch(() => {});
  });
}

function extraSmallIcon(item: FileItem): string | null {
  if (explorer.isAtDrives || item.isDirectory) return null;
  if (extraSmallIcons.value[item.path]) {
    const idx = iconCacheOrder.indexOf(item.path);
    if (idx > 0) { iconCacheOrder.splice(idx, 1); iconCacheOrder.unshift(item.path); }
    return extraSmallIcons.value[item.path];
  }
  if (!iconPendingQueue.has(item.path)) {
    iconPendingQueue.add(item.path);
    if (iconBatchTimer === null) {
      iconBatchTimer = setTimeout(() => { iconBatchTimer = null; flushIconQueue(); }, 0);
    }
  }
  return null;
}

const virtualizerOptions = computed(() => ({
  count: totalVirtualRows.value,
  getScrollElement: () => scrollRef.value,
  estimateSize: () => virtualItemHeight.value,
  overscan: 2,
}));
const virtualizer = useVirtualizer(virtualizerOptions);

// --- resize tracking ---
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!explorer.currentPath) explorer.navigateTo('');
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', handleKeydown);
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      containerWidth.value = entries[0].contentRect.width;
    });
    resizeObserver.observe(scrollRef.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', handleKeydown);
  resizeObserver?.disconnect();
});

// --- multi-select ---
function onItemClick(event: MouseEvent, path: string, index: number) {
  if (event.ctrlKey || event.metaKey) {
    explorer.toggleSelect(path);
    selectionAnchorIndex.value = index;
  } else if (event.shiftKey && selectionAnchorIndex.value >= 0) {
    const start = Math.min(selectionAnchorIndex.value, index);
    const end = Math.max(selectionAnchorIndex.value, index);
    explorer.clearSelection();
    for (let i = start; i <= end; i++) {
      explorer.selectedFiles.add(filteredFiles.value[i].path);
    }
    selectionAnchorIndex.value = index;
  } else {
    explorer.clearSelection();
    explorer.selectedFiles.add(path);
    selectionAnchorIndex.value = index;
  }
}

// --- keyboard shortcuts ---
function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

  if (e.key === 'Escape') {
    explorer.clearSelection();
  } else if (e.key === 'Delete') {
    deleteSelected();
  } else if (e.key === 'F2') {
    e.preventDefault();
    renameSelected();
  } else if (e.key === 'Enter') {
    enterSelected();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    explorer.clearSelection();
    filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path));
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    copySelectedPaths();
  }
}

async function deleteSelected() {
  const items = filteredFiles.value.filter((f) => explorer.selectedFiles.has(f.path));
  if (items.length === 0) return;
  const msg = items.length === 1
    ? t('explorer.deleteConfirm', { name: items[0].name })
    : t('explorer.deleteMultipleConfirm', { count: items.length });
  const ok = await showConfirm(msg);
  if (!ok) return;
  await Promise.all(items.map((f) => window.api?.invoke('fs:delete', f.path)));
  explorer.loadFiles(explorer.currentPath);
}

async function renameSelected() {
  const item = filteredFiles.value.find((f) => explorer.selectedFiles.has(f.path));
  if (!item) return;
  const newName = await showPrompt(t('explorer.rename') + ':', item.name);
  if (newName && newName !== item.name) {
    await window.api?.invoke('media:renameFile', item.path, newName);
    explorer.loadFiles(explorer.currentPath);
  }
}

function enterSelected() {
  const item = filteredFiles.value.find((f) => explorer.selectedFiles.has(f.path));
  if (item) handleDoubleClick(item);
}

function copySelectedPaths() {
  const paths = filteredFiles.value
    .filter((f) => explorer.selectedFiles.has(f.path))
    .map((f) => f.path);
  if (paths.length > 0) {
    navigator.clipboard.writeText(paths.join('\n')).catch(() => {});
  }
}

async function createNewFolder() {
  const name = await showPrompt(t('explorer.newFolder'));
  if (!name || !name.trim()) return;
  const path = explorer.currentPath ? explorer.currentPath + '\\' + name.trim() : name.trim();
  const ok = await window.api?.invoke('fs:mkdir', path);
  if (ok) explorer.loadFiles(explorer.currentPath);
}

// --- wheel (ctrl+scroll for view mode) ---
function onWheel(e: WheelEvent) {
  if (e.ctrlKey) {
    e.preventDefault();
    if (e.deltaY < 0) explorer.prevViewMode();
    else explorer.nextViewMode();
  }
}

// --- image viewer ---
function openImageViewer(index: number) {
  imageViewerFiles.value = filteredFiles.value.filter(
    (f) => !f.isDirectory && f.extension && IMAGE_EXTS.has(f.extension)
  );
  const actualIndex = imageViewerFiles.value.findIndex(
    (f) => f.path === filteredFiles.value[index].path
  );
  imageViewerIndex.value = actualIndex >= 0 ? actualIndex : 0;
}

function closeImageViewer() {
  imageViewerIndex.value = null;
  imageViewerFiles.value = [];
}

function isLibraryFolder(path: string): boolean {
  const normalized = path.replace(/[\\/]$/, '');
  return library.folders.some((f) => f.replace(/[\\/]$/, '') === normalized);
}

function handleDoubleClick(item: FileItem) {
  if (item.isDirectory) {
    explorer.navigateTo(item.path);
  } else if (item.extension && IMAGE_EXTS.has(item.extension)) {
    const idx = filteredFiles.value.findIndex((f) => f.path === item.path);
    openImageViewer(idx);
  } else if (item.extension && MEDIA_EXTS.has(item.extension)) {
    const isVideo = VIDEO_EXTS.has(item.extension);
    const track: MediaFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: item.path, name: item.name, type: isVideo ? 'video' : 'audio',
      size: item.size, duration: 0, extension: item.extension,
      mimeType: '', addedAt: Date.now(), playCount: 0
    };
    player.setTrack(track);
    if (isVideo) router.push('/player');
  }
}

// --- context menus ---
function pushSeparator(items: ContextMenuItem[]) {
  items.push({ separator: true, label: '' });
}

function handleEmptyContextMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [];
  items.push({ label: t('explorer.newFolder'), action: () => createNewFolder() });
  items.push({ label: t('explorer.openInTerminal'), action: () => window.api?.invoke('shell:openTerminal', explorer.currentPath) });
  pushSeparator(items);
  items.push({ label: t('explorer.openWithDefaultApp'), action: () => window.api?.invoke('shell:openWithDefault', explorer.currentPath) });
  items.push({ label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', explorer.currentPath) });
  pushSeparator(items);
  items.push({ label: t('common.selectAll'), action: () => { explorer.clearSelection(); filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path)); }, shortcut: 'Ctrl+A' });
  ui.showContextMenu(event.clientX, event.clientY, items);
}

function handleContextMenu(event: MouseEvent, item: FileItem) {
  const items: ContextMenuItem[] = [];

  if (item.isDirectory) {
    items.push({ label: t('explorer.open'), action: () => explorer.navigateTo(item.path), shortcut: 'Enter' });
    pushSeparator(items);
    const alreadyInLibrary = isLibraryFolder(item.path);
    items.push({
      label: alreadyInLibrary ? t('explorer.removeFromLibrary') : t('explorer.addToLibrary'),
      action: () => { if (alreadyInLibrary) library.removeFolder(item.path); else library.addFolder(item.path); }
    });
    items.push({ label: t('explorer.openInTerminal'), action: () => window.api?.invoke('shell:openTerminal', item.path) });
    items.push({ label: t('explorer.openWithDefaultApp'), action: () => window.api?.invoke('shell:openWithDefault', item.path) });
    items.push({ label: t('explorer.copyPath'), action: () => window.api?.invoke('fs:copyPath', item.path), shortcut: 'Ctrl+C' });
    items.push({ label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', item.path) });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), disabled: isLibraryFolder(item.path), action: () => deleteItem(item), shortcut: 'Del' });
  } else if (item.extension && IMAGE_EXTS.has(item.extension)) {
    items.push({ label: t('explorer.openImage'), action: () => { const idx = filteredFiles.value.findIndex((f) => f.path === item.path); openImageViewer(idx); }, shortcut: 'Enter' });
    pushSeparator(items);
    items.push({ label: t('explorer.openWithDefaultApp'), action: () => window.api?.invoke('shell:openWithDefault', item.path) });
    items.push({ label: t('explorer.copyPath'), action: () => window.api?.invoke('fs:copyPath', item.path), shortcut: 'Ctrl+C' });
    items.push({ label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', item.path) });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), action: () => deleteItem(item), shortcut: 'Del' });
  } else if (item.extension && MEDIA_EXTS.has(item.extension)) {
    const isVideo = VIDEO_EXTS.has(item.extension);
    items.push({ label: t('common.play'), action: () => handleDoubleClick(item), shortcut: 'Enter' });
    items.push({ label: t('common.addToQueue'), action: () => {
      const mf: MediaFile = { id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, path: item.path, name: item.name, type: isVideo ? 'video' : 'audio', size: item.size, duration: 0, extension: item.extension || '', mimeType: '', addedAt: Date.now(), playCount: 0 };
      player.addToQueue(mf);
    }});
    pushSeparator(items);
    items.push({ label: t('explorer.openWithDefaultApp'), action: () => window.api?.invoke('shell:openWithDefault', item.path) });
    items.push({ label: t('explorer.copyPath'), action: () => window.api?.invoke('fs:copyPath', item.path), shortcut: 'Ctrl+C' });
    items.push({ label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', item.path) });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), action: () => deleteItem(item), shortcut: 'Del' });
  } else {
    items.push({ label: t('explorer.openWithDefaultApp'), action: () => window.api?.invoke('shell:openWithDefault', item.path) });
    items.push({ label: t('explorer.copyPath'), action: () => window.api?.invoke('fs:copyPath', item.path), shortcut: 'Ctrl+C' });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), action: () => deleteItem(item), shortcut: 'Del' });
    pushSeparator(items);
    items.push({ label: t('common.showInFolder'), action: () => window.api?.invoke('shell:showItemInFolder', item.path) });
  }

  pushSeparator(items);
  items.push({ label: t('common.selectAll'), action: () => { explorer.clearSelection(); filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path)); }, shortcut: 'Ctrl+A' });
  ui.showContextMenu(event.clientX, event.clientY, items);
}

async function deleteItem(item: FileItem) {
  if (!confirm(t('explorer.deleteConfirm', { name: item.name }))) return;
  await window.api?.invoke('fs:delete', item.path);
  explorer.loadFiles(explorer.currentPath);
}

async function renameItem(item: FileItem) {
  const newName = await showPrompt(t('explorer.rename') + ':', item.name);
  if (newName && newName !== item.name) {
    await window.api?.invoke('media:renameFile', item.path, newName);
    explorer.loadFiles(explorer.currentPath);
  }
}
</script>

<template>
  <div class="flex h-full">
    <ExplorerNavPane />
    <div class="flex flex-col flex-1 min-w-0">
      <!-- toolbar -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-base">
        <ExplorerBreadcrumb />

        <ExplorerToolbar @search="searchQuery = $event" />

        <ExplorerViewModeDropdown />

        <button class="p-1.5 rounded-lg transition-colors" :class="pinned ? 'text-accent-base bg-accent-ghost' : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'" title="Always on top" @click="togglePin"><Pin v-if="pinned" :size="14" class="pointer-events-none" /><PinOff v-else :size="14" class="pointer-events-none" /></button>

        <button class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors" :title="$t('explorer.newFolder')" @click="createNewFolder"><Plus :size="16" class="pointer-events-none" /></button>

        <span v-if="explorer.selectedCount > 0" class="text-[11px] text-fg-muted whitespace-nowrap">{{ explorer.selectedCount }} {{ $t('common.selected') }}</span>
      </div>

      <!-- content -->
      <div ref="scrollRef" class="flex-1 overflow-auto p-3" :class="{ 'cursor-progress': explorer.isLoading }" @contextmenu.prevent="handleEmptyContextMenu">
        <div v-if="filteredFiles.length === 0 && !explorer.isLoading" class="flex flex-col items-center justify-center py-16 text-fg-faint">
          <FolderOpen :size="48" class="mb-3 opacity-30" />
          <p class="text-sm">{{ $t('explorer.folderEmpty') }}</p>
        </div>

        <div v-if="explorer.isLoading && filteredFiles.length === 0" class="flex justify-center py-8">
          <div class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin" />
        </div>

        <div v-if="explorer.isAtDrives && filteredFiles.length > 0" class="mb-3">
          <h3 class="text-xs font-medium text-fg-faint uppercase tracking-wider flex items-center gap-2 px-1"><HardDrive :size="12" /> {{ $t('explorer.drives') }}</h3>
        </div>

        <!-- extraSmall: virtualized list -->
        <div v-if="explorer.viewMode === 'extraSmall' && filteredFiles.length > 0" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
          <div v-for="virtualRow in virtualizer.getVirtualItems()" :key="virtualRow.index" :style="{ position: 'absolute', top: 0, transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px`, width: '100%' }">
            <button class="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-bg-hover transition-colors text-left text-xs group relative h-full" :class="{ 'bg-accent-ghost ring-1 ring-accent-base': explorer.selectedFiles.has(filteredFiles[virtualRow.index].path), 'bg-accent-ghost/15 ring-1 ring-accent-base/30': !filteredFiles[virtualRow.index].isDirectory ? false : isLibraryFolder(filteredFiles[virtualRow.index].path) && !explorer.selectedFiles.has(filteredFiles[virtualRow.index].path) }" @click="onItemClick($event, filteredFiles[virtualRow.index].path, virtualRow.index)" @dblclick="handleDoubleClick(filteredFiles[virtualRow.index])" @contextmenu.stop.prevent="handleContextMenu($event, filteredFiles[virtualRow.index])">
              <img v-if="extraSmallIcon(filteredFiles[virtualRow.index])" :src="extraSmallIcon(filteredFiles[virtualRow.index])!" class="w-4 h-4 object-contain shrink-0" />
              <HardDrive v-else-if="explorer.isAtDrives" :size="12" class="text-accent-base shrink-0" />
              <FolderOpen v-else-if="filteredFiles[virtualRow.index].isDirectory" :size="12" class="text-accent-base shrink-0" />
              <span class="truncate flex-1">{{ filteredFiles[virtualRow.index].name }}</span>
              <span v-if="isLibraryFolder(filteredFiles[virtualRow.index].path) && !explorer.isAtDrives" class="text-[8px] px-1 rounded bg-accent-base/20 text-accent-base font-bold border border-accent-base/40">LIB</span>
            </button>
          </div>
        </div>

        <!-- grid modes: virtualized rows -->
        <div v-else-if="isGridMode && filteredFiles.length > 0" :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
          <div v-for="virtualRow in virtualizer.getVirtualItems()" :key="virtualRow.index" :style="{ position: 'absolute', top: 0, transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px`, width: '100%', display: 'flex', gap: `${GRID_GAPS[explorer.viewMode]}px` }" class="items-start px-[2px]">
            <div v-for="(item, i) in getRowItems(virtualRow.index)" :key="item.path" :style="{ width: `${GRID_ITEM_WIDTHS[explorer.viewMode]}px`, flex: '0 0 auto' }">
              <ExplorerGridItem :item="item" :view-mode="explorer.viewMode" :is-selected="explorer.selectedFiles.has(item.path)" :is-at-drives="explorer.isAtDrives" :is-library-folder="!item.isDirectory ? false : isLibraryFolder(item.path)" @select="(path: string, e: MouseEvent) => onItemClick(e, path, virtualRow.index * itemsPerRow + i)" @double-click="handleDoubleClick" @context-menu="handleContextMenu" />
            </div>
          </div>
        </div>

        <!-- details: virtualized table -->
        <div v-else-if="explorer.viewMode === 'details' && filteredFiles.length > 0">
          <div class="grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 text-[11px] text-fg-faint font-medium uppercase tracking-wider border-b border-border-default mb-1 sticky top-0 bg-bg-base z-10">
            <button class="text-left flex items-center gap-1 hover:text-fg-base" @click="explorer.toggleSort('name')">{{ $t('explorer.name') }}<ChevronUp v-if="explorer.sortBy === 'name' && explorer.sortOrder === 'asc'" :size="10" /><ChevronDown v-if="explorer.sortBy === 'name' && explorer.sortOrder === 'desc'" :size="10" /></button>
            <button class="text-left flex items-center gap-1 hover:text-fg-base" @click="explorer.toggleSort('size')">{{ $t('explorer.size') }}<ChevronUp v-if="explorer.sortBy === 'size' && explorer.sortOrder === 'asc'" :size="10" /><ChevronDown v-if="explorer.sortBy === 'size' && explorer.sortOrder === 'desc'" :size="10" /></button>
            <button class="text-left flex items-center gap-1 hover:text-fg-base" @click="explorer.toggleSort('type')">{{ $t('explorer.type') }}<ChevronUp v-if="explorer.sortBy === 'type' && explorer.sortOrder === 'asc'" :size="10" /><ChevronDown v-if="explorer.sortBy === 'type' && explorer.sortOrder === 'desc'" :size="10" /></button>
            <button class="text-right flex items-center gap-1 justify-end hover:text-fg-base" @click="explorer.toggleSort('modified')">{{ $t('explorer.modified') }}<ChevronUp v-if="explorer.sortBy === 'modified' && explorer.sortOrder === 'asc'" :size="10" /><ChevronDown v-if="explorer.sortBy === 'modified' && explorer.sortOrder === 'desc'" :size="10" /></button>
          </div>
          <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
            <div v-for="virtualRow in virtualizer.getVirtualItems()" :key="virtualRow.index" :style="{ position: 'absolute', top: 0, transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px`, width: '100%' }">
              <ExplorerTableRow :item="filteredFiles[virtualRow.index]" :is-selected="explorer.selectedFiles.has(filteredFiles[virtualRow.index].path)" :is-at-drives="explorer.isAtDrives" :is-library-folder="!filteredFiles[virtualRow.index].isDirectory ? false : isLibraryFolder(filteredFiles[virtualRow.index].path)" @select="(path: string, e: MouseEvent) => onItemClick(e, path, virtualRow.index)" @double-click="handleDoubleClick" @context-menu="handleContextMenu" />
            </div>
          </div>
        </div>
      </div>

      <!-- prompt dialog -->
      <Teleport to="body">
        <div v-if="promptVisible" class="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center" @click.self="promptCancel">
          <div class="bg-bg-surface border border-border-default rounded-xl p-5 min-w-[300px] shadow-2xl">
            <p class="text-sm text-fg-base mb-3 whitespace-pre-wrap">{{ promptMessage }}</p>
            <input v-if="!promptIsConfirm" id="prompt-input" v-model="promptValue" type="text" class="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm text-fg-base outline-none focus:ring-1 focus:ring-accent-base" @keydown="promptKeydown">
            <div class="flex justify-end gap-2 mt-4">
              <button class="px-4 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-bg-hover transition-colors" @click="promptCancel">{{ $t('common.cancel') }}</button>
              <button class="px-4 py-1.5 rounded-lg text-xs bg-accent-base text-white hover:bg-accent-base/90 transition-colors" @click="promptConfirm">{{ $t('common.ok') }}</button>
            </div>
          </div>
        </div>
      </Teleport>

      <ImageViewer v-if="imageViewerIndex !== null" :files="imageViewerFiles" :initial-index="imageViewerIndex ?? 0" @close="closeImageViewer" />
    </div>
  </div>
</template>
