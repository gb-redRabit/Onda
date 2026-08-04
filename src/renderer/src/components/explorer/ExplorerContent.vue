<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef, inject } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useI18n } from 'vue-i18n';
import { ChevronUp, ChevronDown, HardDrive, FolderOpen } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useClipboardStore } from '@renderer/stores/clipboard';
import { useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { logger } from '@shared/logger';
import { beginFileDrag } from '@renderer/utils/fileDrag';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { handleTabDrop } from '@renderer/utils/explorerTabDrop';
import ExplorerGridItem from '@renderer/components/explorer/ExplorerGridItem.vue';
import ExplorerTableRow from '@renderer/components/explorer/ExplorerTableRow.vue';
import type { FileItem } from '@renderer/types/explorer';

const props = defineProps<{
  files: FileItem[];
}>();

const emit = defineEmits<{
  open: [item: FileItem];
  menu: [event: MouseEvent, item: FileItem | null];
}>();

const explorer = useExplorerStore();
const fileClipboard = useClipboardStore();
const library = useLibraryStore();
const settings = useSettingsStore();
const { t } = useI18n();
const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async () => true);

const GRID_ITEM_WIDTHS: Record<string, number> = {
  small: 72,
  medium: 108,
  large: 160,
  extraLarge: 240
};
const GRID_GAPS: Record<string, number> = { small: 4, medium: 8, large: 12, extraLarge: 16 };
const GRID_ITEM_HEIGHTS: Record<string, number> = {
  small: 66,
  medium: 90,
  large: 118,
  extraLarge: 146
};
const LIST_ITEM_HEIGHTS: Record<string, number> = { extraSmall: 28, details: 36 };

const files = computed(() => props.files);
const scrollRef = ref<HTMLDivElement | null>(null);
const containerWidth = ref(800);
const selectionAnchorIndex = ref(-1);
const hoveredFolderPath = ref<string | null>(null);
const extraSmallIcons = shallowRef<Record<string, string>>({});

const isListMode = computed(
  () => explorer.viewMode === 'extraSmall' || explorer.viewMode === 'details'
);
const isGridMode = computed(() => !isListMode.value);

const itemsPerRow = computed(() => {
  if (isListMode.value) return 1;
  const config = GRID_ITEM_WIDTHS[explorer.viewMode] + GRID_GAPS[explorer.viewMode];
  return Math.max(1, Math.floor((containerWidth.value + GRID_GAPS[explorer.viewMode]) / config));
});

const totalVirtualRows = computed(() => {
  if (isListMode.value) return files.value.length;
  return Math.ceil(files.value.length / itemsPerRow.value);
});

const virtualItemHeight = computed(() => {
  if (isListMode.value) return LIST_ITEM_HEIGHTS[explorer.viewMode];
  return GRID_ITEM_HEIGHTS[explorer.viewMode];
});

function getRowItems(rowIndex: number): FileItem[] {
  if (isListMode.value) return [files.value[rowIndex]];
  const start = rowIndex * itemsPerRow.value;
  return files.value.slice(start, start + itemsPerRow.value);
}

function isLibraryFolder(path: string): boolean {
  const normalized = path.replace(/[\\/]$/, '');
  return library.folders.some((f) => f.replace(/[\\/]$/, '') === normalized);
}

const ICON_CACHE_MAX = 500;
const ICON_CONCURRENCY = 6;
const iconCacheOrder: string[] = [];
const iconPendingQueue = new Set<string>();
let iconActive = 0;
let iconQueueTimer: ReturnType<typeof setTimeout> | null = null;
let iconRenderTimer: ReturnType<typeof setTimeout> | null = null;
let pendingIcons: Record<string, string> = {};

function scheduleIconRender() {
  if (iconRenderTimer !== null) return;
  iconRenderTimer = setTimeout(() => {
    iconRenderTimer = null;
    if (Object.keys(pendingIcons).length === 0) return;
    extraSmallIcons.value = { ...extraSmallIcons.value, ...pendingIcons };
    pendingIcons = {};
    triggerRef(extraSmallIcons);
  }, 0);
}

function pumpIcons() {
  while (iconActive < ICON_CONCURRENCY && iconPendingQueue.size > 0) {
    const path = iconPendingQueue.values().next().value as string;
    iconPendingQueue.delete(path);
    iconActive++;
    window.api
      ?.invoke('shell:getFileIcon', path)
      .then((icon) => {
        if (icon) {
          if (iconCacheOrder.length >= ICON_CACHE_MAX) {
            const evicted = iconCacheOrder.pop()!;
            delete pendingIcons[evicted];
            delete extraSmallIcons.value[evicted];
          }
          iconCacheOrder.unshift(path);
          pendingIcons[path] = icon as string;
          scheduleIconRender();
        }
      })
      .catch((err) => logger.error('Explorer', 'getFileIcon', err))
      .finally(() => {
        iconActive--;
        pumpIcons();
      });
  }
}

function extraSmallIcon(item: FileItem): string | null {
  if (explorer.isAtDrives || item.isDirectory) return null;
  if (extraSmallIcons.value[item.path]) {
    const idx = iconCacheOrder.indexOf(item.path);
    if (idx > 0) {
      iconCacheOrder.splice(idx, 1);
      iconCacheOrder.unshift(item.path);
    }
    return extraSmallIcons.value[item.path];
  }
  if (!iconPendingQueue.has(item.path)) {
    iconPendingQueue.add(item.path);
    if (iconQueueTimer === null) {
      iconQueueTimer = setTimeout(() => {
        iconQueueTimer = null;
        pumpIcons();
      }, 0);
    }
  }
  return null;
}

const virtualizerOptions = computed(() => ({
  count: totalVirtualRows.value,
  getScrollElement: () => scrollRef.value,
  estimateSize: () => virtualItemHeight.value,
  overscan: 2
}));
const virtualizer = useVirtualizer(virtualizerOptions);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      containerWidth.value = entries[0].contentRect.width;
    });
    resizeObserver.observe(scrollRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (iconQueueTimer) {
    clearTimeout(iconQueueTimer);
    iconQueueTimer = null;
  }
  if (iconRenderTimer) {
    clearTimeout(iconRenderTimer);
    iconRenderTimer = null;
  }
});

function onItemClick(event: MouseEvent, path: string, index: number) {
  if (event.ctrlKey || event.metaKey) {
    explorer.toggleSelect(path);
    selectionAnchorIndex.value = index;
  } else if (event.shiftKey && selectionAnchorIndex.value >= 0) {
    const start = Math.min(selectionAnchorIndex.value, index);
    const end = Math.max(selectionAnchorIndex.value, index);
    explorer.clearSelection();
    for (let i = start; i <= end; i++) {
      explorer.selectedFiles.add(files.value[i].path);
    }
    selectionAnchorIndex.value = index;
  } else {
    explorer.clearSelection();
    explorer.selectedFiles.add(path);
    selectionAnchorIndex.value = index;
  }
}

// --- content drag & drop ---
function getDropPaths(dt: DataTransfer | null, raw: string): string[] {
  const fromPlain = raw.split('\n').filter(Boolean);
  if (fromPlain.length > 0) return fromPlain;
  return getDroppedFilePaths(dt);
}

function onContentDragOver(e: DragEvent) {
  if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
  const el = (e.target as HTMLElement)?.closest('[data-folder-path]');
  hoveredFolderPath.value = el ? el.getAttribute('data-folder-path') : null;
}

function onContentDragLeave(e: DragEvent) {
  const el = (e.target as HTMLElement)?.closest('[data-folder-path]');
  if (!el) hoveredFolderPath.value = null;
}

async function onContentDrop(e: DragEvent) {
  e.preventDefault();
  const raw = e.dataTransfer?.getData('text/plain') || '';
  if (handleTabDrop(raw)) return;
  const paths = getDropPaths(e.dataTransfer, raw);
  const targetDir = hoveredFolderPath.value || explorer.currentPath;
  hoveredFolderPath.value = null;
  if (paths.length === 0) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (settings.explorer.confirmBeforeMove) {
    const key = ctrl ? 'explorer.copyConfirm' : 'explorer.moveConfirm';
    const ok = await showConfirm(
      t(key, { n: paths.length, dir: targetDir.split('\\').pop() || targetDir })
    );
    if (!ok) return;
  }
  const method = ctrl ? 'fs:copy' : 'fs:move';
  await window.api?.invoke(method, paths, targetDir);
  explorer.loadFiles(explorer.currentPath);
  window.api?.send('explorer:refreshAll');
}

// --- band (marquee) select ---
const bandSelect = ref<{ left: number; top: number; width: number; height: number } | null>(null);
const bandOrigin = ref<{ clientX: number; clientY: number } | null>(null);

function onBandMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'BUTTON' || target.closest('button')) return;
  explorer.clearSelection();
  const rect = scrollRef.value?.getBoundingClientRect();
  if (!rect) return;
  bandOrigin.value = { clientX: e.clientX, clientY: e.clientY };
  bandSelect.value = { left: e.clientX, top: e.clientY, width: 0, height: 0 };
  document.addEventListener('mousemove', onBandMouseMove);
  document.addEventListener('mouseup', onBandMouseUp);
}

function onBandMouseMove(e: MouseEvent) {
  if (!bandOrigin.value) return;
  const ox = bandOrigin.value.clientX;
  const oy = bandOrigin.value.clientY;
  bandSelect.value = {
    left: Math.min(e.clientX, ox),
    top: Math.min(e.clientY, oy),
    width: Math.abs(e.clientX - ox),
    height: Math.abs(e.clientY - oy)
  };
  const sel = bandSelect.value;
  const buttons = scrollRef.value?.querySelectorAll('button[data-file-path]');
  if (!buttons) return;
  explorer.clearSelection();
  buttons.forEach((btn) => {
    const r = btn.getBoundingClientRect();
    const overlap = !(
      r.right < sel.left ||
      r.left > sel.left + sel.width ||
      r.bottom < sel.top ||
      r.top > sel.top + sel.height
    );
    if (overlap) {
      const path = btn.getAttribute('data-file-path');
      if (path) explorer.selectedFiles.add(path);
    }
  });
}

function onBandMouseUp() {
  bandSelect.value = null;
  bandOrigin.value = null;
  document.removeEventListener('mousemove', onBandMouseMove);
  document.removeEventListener('mouseup', onBandMouseUp);
}

function reveal(path: string) {
  const idx = files.value.findIndex((f) => f.path === path);
  explorer.clearSelection();
  explorer.selectedFiles.add(path);
  if (idx >= 0) {
    const row = isListMode.value ? idx : Math.floor(idx / itemsPerRow.value);
    virtualizer.value.scrollToIndex(row, { align: 'center' });
  }
}

defineExpose({ reveal });
</script>

<template>
  <div
    ref="scrollRef"
    class="flex-1 overflow-auto p-3"
    :class="{ 'cursor-progress': explorer.isLoading }"
    @contextmenu.prevent="emit('menu', $event, null)"
    @dragover="onContentDragOver"
    @dragleave="onContentDragLeave"
    @drop="onContentDrop"
    @mousedown="onBandMouseDown"
  >
    <div
      v-if="files.length === 0 && !explorer.isLoading"
      class="flex flex-col items-center justify-center py-16 text-fg-faint"
    >
      <FolderOpen :size="48" class="mb-3 opacity-30" />
      <p class="text-sm">{{ $t('explorer.folderEmpty') }}</p>
    </div>

    <div
      v-if="explorer.isLoading && files.length === 0"
      class="flex justify-center py-8"
    >
      <div
        class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
      />
    </div>

    <div v-if="explorer.isAtDrives && files.length > 0" class="mb-3">
      <h3
        class="text-xs font-medium text-fg-faint uppercase tracking-wider flex items-center gap-2 px-1"
      >
        <HardDrive :size="12" /> {{ $t('explorer.drives') }}
      </h3>
    </div>

    <!-- extraSmall: virtualized list -->
    <div
      v-if="explorer.viewMode === 'extraSmall' && files.length > 0"
      :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="virtualRow.index"
        :style="{
          position: 'absolute',
          top: 0,
          transform: `translateY(${virtualRow.start}px)`,
          height: `${virtualRow.size}px`,
          width: '100%'
        }"
      >
        <button
          :draggable="!explorer.isAtDrives"
          :data-file-path="files[virtualRow.index].path"
          :data-folder-path="
            files[virtualRow.index].isDirectory ? files[virtualRow.index].path : undefined
          "
          class="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-bg-hover transition-colors text-left text-xs group relative h-full"
          :class="{
            'bg-accent-ghost ring-1 ring-accent-base': explorer.selectedFiles.has(
              files[virtualRow.index].path
            ),
            'bg-accent-ghost/15 ring-1 ring-accent-base/30': !files[virtualRow.index].isDirectory
              ? false
              : isLibraryFolder(files[virtualRow.index].path) &&
                !explorer.selectedFiles.has(files[virtualRow.index].path),
            'ring-2 ring-accent-base bg-accent-ghost/50':
              hoveredFolderPath && hoveredFolderPath === files[virtualRow.index].path,
            'opacity-40': fileClipboard.isCut(files[virtualRow.index].path)
          }"
          @click="onItemClick($event, files[virtualRow.index].path, virtualRow.index)"
          @dblclick="emit('open', files[virtualRow.index])"
          @contextmenu.stop.prevent="emit('menu', $event, files[virtualRow.index])"
          @dragstart="
            (e: DragEvent) => {
              const p = files[virtualRow.index].path;
              if (explorer.selectedFiles.has(p)) {
                beginFileDrag(e, [...explorer.selectedFiles]);
              } else {
                beginFileDrag(e, [p]);
              }
            }
          "
        >
          <img
            v-if="extraSmallIcon(files[virtualRow.index])"
            :src="extraSmallIcon(files[virtualRow.index])!"
            class="w-4 h-4 object-contain shrink-0"
          />
          <HardDrive
            v-else-if="explorer.isAtDrives"
            :size="12"
            class="text-accent-base shrink-0"
          />
          <FolderOpen
            v-else-if="files[virtualRow.index].isDirectory"
            :size="12"
            class="text-accent-base shrink-0"
          />
          <span class="truncate flex-1">{{ files[virtualRow.index].name }}</span>
          <span
            v-if="isLibraryFolder(files[virtualRow.index].path) && !explorer.isAtDrives"
            class="text-[8px] px-1 rounded bg-accent-base/20 text-accent-base font-bold border border-accent-base/40"
            >LIB</span
          >
        </button>
      </div>
    </div>

    <!-- grid modes: virtualized rows -->
    <div
      v-else-if="isGridMode && files.length > 0"
      :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="virtualRow.index"
        :style="{
          position: 'absolute',
          top: 0,
          transform: `translateY(${virtualRow.start}px)`,
          height: `${virtualRow.size}px`,
          width: '100%',
          display: 'flex',
          gap: `${GRID_GAPS[explorer.viewMode]}px`
        }"
        class="items-start px-0.5"
      >
        <div
          v-for="(item, i) in getRowItems(virtualRow.index)"
          :key="item.path"
          :style="{ width: `${GRID_ITEM_WIDTHS[explorer.viewMode]}px`, flex: '0 0 auto' }"
        >
          <ExplorerGridItem
            :item="item"
            :view-mode="explorer.viewMode"
            :is-selected="explorer.selectedFiles.has(item.path)"
            :is-at-drives="explorer.isAtDrives"
            :is-library-folder="!item.isDirectory ? false : isLibraryFolder(item.path)"
            :hovered-folder-path="hoveredFolderPath"
            :is-cut="fileClipboard.isCut(item.path)"
            @select="(path: string, e: MouseEvent) => onItemClick(e, path, virtualRow.index * itemsPerRow + i)"
            @double-click="emit('open', $event)"
            @context-menu="(e: MouseEvent, item: FileItem) => emit('menu', e, item)"
          />
        </div>
      </div>
    </div>

    <!-- details: virtualized table -->
    <div v-else-if="explorer.viewMode === 'details' && files.length > 0">
      <div
        class="grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 text-[11px] text-fg-faint font-medium uppercase tracking-wider border-b border-border-default mb-1 sticky top-0 bg-bg-base z-10"
      >
        <button
          class="text-left flex items-center gap-1 hover:text-fg-base"
          @click="explorer.toggleSort('name')"
        >
          {{ $t('explorer.name')
          }}<ChevronUp
            v-if="explorer.sortBy === 'name' && explorer.sortOrder === 'asc'"
            :size="10"
          /><ChevronDown
            v-if="explorer.sortBy === 'name' && explorer.sortOrder === 'desc'"
            :size="10"
          />
        </button>
        <button
          class="text-left flex items-center gap-1 hover:text-fg-base"
          @click="explorer.toggleSort('size')"
        >
          {{ $t('explorer.size')
          }}<ChevronUp
            v-if="explorer.sortBy === 'size' && explorer.sortOrder === 'asc'"
            :size="10"
          /><ChevronDown
            v-if="explorer.sortBy === 'size' && explorer.sortOrder === 'desc'"
            :size="10"
          />
        </button>
        <button
          class="text-left flex items-center gap-1 hover:text-fg-base"
          @click="explorer.toggleSort('type')"
        >
          {{ $t('explorer.type')
          }}<ChevronUp
            v-if="explorer.sortBy === 'type' && explorer.sortOrder === 'asc'"
            :size="10"
          /><ChevronDown
            v-if="explorer.sortBy === 'type' && explorer.sortOrder === 'desc'"
            :size="10"
          />
        </button>
        <button
          class="text-right flex items-center gap-1 justify-end hover:text-fg-base"
          @click="explorer.toggleSort('modified')"
        >
          {{ $t('explorer.modified')
          }}<ChevronUp
            v-if="explorer.sortBy === 'modified' && explorer.sortOrder === 'asc'"
            :size="10"
          /><ChevronDown
            v-if="explorer.sortBy === 'modified' && explorer.sortOrder === 'desc'"
            :size="10"
          />
        </button>
      </div>
      <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div
          v-for="virtualRow in virtualizer.getVirtualItems()"
          :key="virtualRow.index"
          :style="{
            position: 'absolute',
            top: 0,
            transform: `translateY(${virtualRow.start}px)`,
            height: `${virtualRow.size}px`,
            width: '100%'
          }"
        >
          <ExplorerTableRow
            :item="files[virtualRow.index]"
            :is-selected="explorer.selectedFiles.has(files[virtualRow.index].path)"
            :is-at-drives="explorer.isAtDrives"
            :is-library-folder="
              !files[virtualRow.index].isDirectory
                ? false
                : isLibraryFolder(files[virtualRow.index].path)
            "
            :hovered-folder-path="hoveredFolderPath"
            :is-cut="fileClipboard.isCut(files[virtualRow.index].path)"
            @select="(path: string, e: MouseEvent) => onItemClick(e, path, virtualRow.index)"
            @double-click="emit('open', $event)"
            @context-menu="(e: MouseEvent, item: FileItem) => emit('menu', e, item)"
          />
        </div>
      </div>
    </div>

    <!-- band select overlay -->
    <div
      v-if="bandSelect"
      class="fixed pointer-events-none z-40 rounded border"
      :style="{
        left: bandSelect.left + 'px',
        top: bandSelect.top + 'px',
        width: bandSelect.width + 'px',
        height: bandSelect.height + 'px',
        borderColor: 'rgb(99,102,241)',
        backgroundColor: 'rgba(99,102,241,0.08)'
      }"
    />
  </div>
</template>