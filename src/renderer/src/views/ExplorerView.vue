<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef, provide } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useVirtualizer } from '@tanstack/vue-virtual';
import {
  ChevronUp, ChevronDown,
  HardDrive, FolderOpen, Monitor, Plus, Pin, PinOff, X, Copy, Trash2, Check, RotateCw, FileText
} from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useClipboardStore } from '@renderer/stores/clipboard';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore, ContextMenuItem } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { logger } from '@renderer/utils/logger';
import { formatFileSize } from '@renderer/utils/formatters';
import { beginTabDrag, claimTabDrag, getActiveTabDrag, clearTabDrag } from '@renderer/utils/tabDrag';
import { beginFileDrag, getDroppedFilePaths } from '@renderer/utils/fileDrag';
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
const fileClipboard = useClipboardStore();
const library = useLibraryStore();
const player = usePlayerStore();
const settings = useSettingsStore();
const ui = useUIStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const { showPrompt, showConfirm, promptVisible, promptIsConfirm, promptMessage, promptValue, promptConfirm, promptCancel, promptKeydown } = usePromptDialog();

provide('showConfirm', showConfirm);

const pinned = ref(false);
const isExplorerWindow = computed(() => route.name === 'explorer-window');

function togglePin() {
  pinned.value = !pinned.value;
  window.api?.invoke('window:setAlwaysOnTop', pinned.value);
}

function toggleDuplicatesPanel() {
  dupPanelOpen.value = !dupPanelOpen.value;
  if (dupPanelOpen.value && dupGroups.value.length === 0 && !dupLoading.value) runDuplicatesScan();
}

async function runDuplicatesScan() {
  if (!explorer.currentPath) return;
  dupLoading.value = true;
  dupSelected.value = new Set();
  try {
    const result = (await window.api?.invoke('fs:findDuplicates', explorer.currentPath)) as DupGroup[] || [];
    dupGroups.value = result;
  } catch {
    dupGroups.value = [];
  } finally {
    dupLoading.value = false;
  }
}

function selectAllDuplicates() {
  const set = new Set<string>();
  for (const g of dupGroups.value) for (const d of g.duplicates) set.add(d);
  dupSelected.value = set;
}

function toggleDupSelection(path: string) {
  const set = new Set(dupSelected.value);
  if (set.has(path)) set.delete(path);
  else set.add(path);
  dupSelected.value = set;
}

async function deleteSelectedDuplicates() {
  const paths = [...dupSelected.value];
  if (paths.length === 0) return;
  const ok = await showConfirm(t('explorer.duplicatesDeleteConfirm', { n: paths.length }));
  if (!ok) return;
  await Promise.all(paths.map((p) => window.api?.invoke('fs:delete', p)));
  dupSelected.value = new Set();
  await runDuplicatesScan();
  explorer.loadFiles(explorer.currentPath);
}

function basenameOf(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function dupName(group: DupGroup, di: number): string {
  return basenameOf(group.duplicates[di]);
}

function revealDupFile(path: string) {
  const idx = filteredFiles.value.findIndex((f) => f.path === path);
  explorer.clearSelection();
  explorer.selectedFiles.add(path);
  if (idx >= 0) {
    const row = isListMode.value ? idx : Math.floor(idx / itemsPerRow.value);
    virtualizer.value.scrollToIndex(row, { align: 'center' });
  }
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

// tab drag state
const tabDropTargetIdx = ref(-1);
const tabDragEnterCount = ref(0);
const tabDropTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const hoveredFolderPath = ref<string | null>(null);
const isDraggingTab = ref(false);

const TAB_PAYLOAD_PREFIX = 'ONDA_TAB::';

function encodeTabPayload(windowId: number, path: string): string {
  return TAB_PAYLOAD_PREFIX + encodeURIComponent(JSON.stringify({ wid: windowId, path }));
}

function parseTabPayload(raw: string): { wid: number; path: string } | null {
  if (!raw.startsWith(TAB_PAYLOAD_PREFIX)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice(TAB_PAYLOAD_PREFIX.length))) as { wid: number; path: string };
    if (typeof parsed.wid !== 'number' || typeof parsed.path !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

// duplicate finder state
interface DupGroup { original: string; duplicates: string[] }
const dupPanelOpen = ref(false);
const dupLoading = ref(false);
const dupGroups = ref<DupGroup[]>([]);
const dupSelected = ref<Set<string>>(new Set());

// properties dialog state
interface PropertiesData {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  createdAt: number;
  modifiedAt: number;
  itemCount?: number;
  dirCount?: number;
  fileCount?: number;
  totalSize?: number;
  truncated?: boolean;
}
const propertiesItem = ref<FileItem | null>(null);
const propertiesData = ref<PropertiesData | null>(null);
const propertiesName = ref('');

// band select
const bandSelect = ref<{ left: number; top: number; width: number; height: number } | null>(null);
const bandOrigin = ref<{ clientX: number; clientY: number } | null>(null);

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
    }).catch((err) => logger.error('Explorer', 'getFileIcon', err));
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
  if (explorer.tabs.length === 0) explorer.addTab(explorer.currentPath || '');
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
  } else if (e.altKey && e.key === 'Enter') {
    e.preventDefault();
    const item = filteredFiles.value.find((f) => explorer.selectedFiles.has(f.path));
    if (item) openProperties(item);
  } else if (e.key === 'Enter') {
    enterSelected();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    explorer.clearSelection();
    filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path));
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault();
    copySelectedPaths();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    e.preventDefault();
    cutSelectedPaths();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault();
    pasteClipboard();
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'n') {
    e.preventDefault();
    openInWindow();
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
    fileClipboard.setClipboard(paths, 'copy');
  }
}

function cutSelectedPaths() {
  const paths = filteredFiles.value
    .filter((f) => explorer.selectedFiles.has(f.path))
    .map((f) => f.path);
  if (paths.length > 0) {
    fileClipboard.setClipboard(paths, 'cut');
  }
}

async function pasteClipboard() {
  if (fileClipboard.items.length === 0 || !fileClipboard.action) return;
  if (!explorer.currentPath) return;
  const paths = fileClipboard.items.map((i) => i.path);
  const dest = explorer.currentPath;
  if (fileClipboard.action === 'copy') {
    await window.api?.invoke('fs:copy', paths, dest);
  } else {
    await window.api?.invoke('fs:move', paths, dest);
    fileClipboard.clear();
  }
  explorer.loadFiles(dest);
  window.api?.send('explorer:refreshAll');
}

async function openInWindow() {
  await window.api?.invoke('explorer:create', explorer.currentPath || undefined);
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

function pushClipboardItems(items: ContextMenuItem[]) {
  if (explorer.selectedCount > 0) {
    items.push({ label: t('common.copy'), action: () => copySelectedPaths(), shortcut: 'Ctrl+C' });
    items.push({ label: t('common.cut'), action: () => cutSelectedPaths(), shortcut: 'Ctrl+X' });
  }
  if (fileClipboard.items.length > 0) {
    items.push({ label: t('common.paste'), action: () => pasteClipboard(), shortcut: 'Ctrl+V' });
  }
}

function handleEmptyContextMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [];
  explorer.clearSelection();
  pushClipboardItems(items);
  if (items.length > 0) pushSeparator(items);
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
  if (!explorer.selectedFiles.has(item.path)) {
    explorer.clearSelection();
    explorer.selectedFiles.add(item.path);
  }
  const items: ContextMenuItem[] = [];
  pushClipboardItems(items);
  if (items.length > 0) pushSeparator(items);

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
  items.push({ label: t('explorer.properties'), action: () => openProperties(item), shortcut: 'Alt+Enter' });
  pushSeparator(items);
  items.push({ label: t('common.selectAll'), action: () => { explorer.clearSelection(); filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path)); }, shortcut: 'Ctrl+A' });
  ui.showContextMenu(event.clientX, event.clientY, items);
}

async function deleteItem(item: FileItem) {
  const ok = await showConfirm(t('explorer.deleteConfirm', { name: item.name }));
  if (!ok) return;
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

// --- properties dialog ---
async function openProperties(item: FileItem) {
  propertiesItem.value = item;
  propertiesName.value = item.name;
  propertiesData.value = null;
  const data = (await window.api?.invoke('fs:getProperties', item.path)) as PropertiesData | null || null;
  propertiesData.value = data;
}

function closeProperties() {
  propertiesItem.value = null;
  propertiesData.value = null;
}

async function applyProperties() {
  if (!propertiesItem.value) return;
  const newName = propertiesName.value.trim();
  if (newName && newName !== propertiesItem.value.name) {
    await window.api?.invoke('media:renameFile', propertiesItem.value.path, newName);
    explorer.loadFiles(explorer.currentPath);
  }
  closeProperties();
}

// --- content area drag & drop ---
function getDropPaths(dt: DataTransfer | null, raw: string): string[] {
  const fromPlain = raw.split('\n').filter(Boolean);
  if (fromPlain.length > 0) return fromPlain;
  return getDroppedFilePaths(dt);
}

function onContentDragOver(e: DragEvent) {
  if (e.dataTransfer) e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
  const el = (e.target as HTMLElement)?.closest('[data-folder-path]');
  if (el) {
    hoveredFolderPath.value = el.getAttribute('data-folder-path');
  } else {
    hoveredFolderPath.value = null;
  }
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
    const ok = await showConfirm(t(key, { n: paths.length, dir: targetDir.split('\\').pop() || targetDir }));
    if (!ok) return;
  }
  const method = ctrl ? 'fs:copy' : 'fs:move';
  await window.api?.invoke(method, paths, targetDir);
  explorer.loadFiles(explorer.currentPath);
  window.api?.send('explorer:refreshAll');
}

// --- tab icons & middle-click close ---
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

// --- tab drag & drop ---
function onTabDragStart(e: DragEvent, idx: number) {
  const tab = explorer.tabs[idx];
  if (!tab) return;
  isDraggingTab.value = true;
  beginTabDrag(tab.path);
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', encodeTabPayload(window.api?.windowId ?? 0, tab.path));
    e.dataTransfer.effectAllowed = 'move';
  }
}

function onTabDragEnd() {
  isDraggingTab.value = false;
  tabDropTargetIdx.value = -1;
  tabDragEnterCount.value = 0;
  if (tabDropTimer.value) { clearTimeout(tabDropTimer.value); tabDropTimer.value = null; }
  const drag = getActiveTabDrag();
  if (!drag || drag.claimed) {
    clearTabDrag();
    return;
  }
  // dropped somewhere that didn't accept the tab (desktop, cancel) →
  // give the target window a moment to confirm acceptance via IPC, then open a new window
  setTimeout(() => {
    const current = getActiveTabDrag();
    clearTabDrag();
    if (!current || current.claimed) return;
    window.api?.invoke('explorer:create', current.path);
    removeTabByPath(current.path);
  }, 200);
}

function removeTabByPath(path: string) {
  const idx = explorer.tabs.findIndex((t) => t.path === path);
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

function onWindowTabDrop(e: DragEvent) {
  const raw = e.dataTransfer?.getData('text/plain') || '';
  handleTabDrop(raw);
}

function handleTabDrop(raw: string) {
  const parsed = parseTabPayload(raw);
  if (!parsed) return false;
  const { wid, path } = parsed;
  if (wid === (window.api?.windowId ?? 0)) {
    // same window → no-op for now (reorder = F11); mark the drag as handled
    claimTabDrag(path);
    return true;
  }
  explorer.addTab(path);
  window.api?.invoke('explorer:tabMoved', wid, path);
  return true;
}

function onTabDragOver(e: DragEvent, idx: number) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
  if (isDraggingTab.value) return;
  tabDropTargetIdx.value = idx;
  if (idx !== explorer.activeTabIndex && tabDropTimer.value === null) {
    tabDropTimer.value = setTimeout(() => {
      explorer.switchTab(idx);
      tabDropTimer.value = null;
    }, 600);
  }
}

function onTabDragEnter(_e: DragEvent, idx: number) {
  if (isDraggingTab.value) return;
  tabDragEnterCount.value++;
  tabDropTargetIdx.value = idx;
}

function onTabDragLeave() {
  if (isDraggingTab.value) return;
  tabDragEnterCount.value--;
  if (tabDragEnterCount.value <= 0) {
    tabDragEnterCount.value = 0;
    tabDropTargetIdx.value = -1;
  }
}

async function onTabDrop(e: DragEvent, idx: number) {
  e.preventDefault();
  e.stopPropagation();
  if (tabDropTimer.value) { clearTimeout(tabDropTimer.value); tabDropTimer.value = null; }
  tabDropTargetIdx.value = -1;
  tabDragEnterCount.value = 0;
  const raw = e.dataTransfer?.getData('text/plain') || '';
  if (handleTabDrop(raw)) return;
  const paths = getDropPaths(e.dataTransfer, raw);
  if (paths.length === 0) return;
  const targetPath = explorer.tabs[idx].path;
  const ctrl = e.ctrlKey || e.metaKey;
  if (settings.explorer.confirmBeforeMove) {
    const key = ctrl ? 'explorer.copyConfirm' : 'explorer.moveConfirm';
    const ok = await showConfirm(t(key, { n: paths.length, dir: targetPath.split('\\').pop() || targetPath }));
    if (!ok) return;
  }
  const method = ctrl ? 'fs:copy' : 'fs:move';
  await window.api?.invoke(method, paths, targetPath);
  explorer.loadFiles(targetPath);
  explorer.switchTab(idx);
  window.api?.send('explorer:refreshAll');
}

// --- band (marquee) select ---
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
    const overlap = !(r.right < sel.left || r.left > sel.left + sel.width || r.bottom < sel.top || r.top > sel.top + sel.height);
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
</script>

<template>
  <div class="flex h-full" @dragover.prevent @drop.prevent="onWindowTabDrop">
    <ExplorerNavPane />
    <div class="flex flex-col flex-1 min-w-0 relative" @dragover.prevent @drop.prevent>
      <!-- tab bar -->
      <div v-if="explorer.tabs.length > 0" class="flex items-center gap-1 px-2 pt-1.5 pb-1 bg-bg-surface border-b border-border-default overflow-x-auto shrink-0">
        <button
          v-for="(tab, idx) in explorer.tabs"
          :key="tab.id"
          draggable="true"
          class="group flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-md transition-colors shrink-0 min-w-0 max-w-44 border"
          :class="{
            'bg-accent-base text-white border-transparent': explorer.activeTabIndex === idx,
            'bg-bg-base text-fg-muted border-transparent hover:text-fg-base hover:bg-bg-hover': explorer.activeTabIndex !== idx,
            'ring-2 ring-accent-base': tabDropTargetIdx === idx && !isDraggingTab
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
          <component :is="tabIcon(tab)" :size="12" class="shrink-0" :class="explorer.activeTabIndex === idx ? 'text-white/80' : 'text-accent-base'" />
          <span class="truncate flex-1">{{ tab.label || $t('explorer.thisComputer') }}</span>
          <span
            class="shrink-0 p-0.5 rounded cursor-pointer hover:bg-black/20 transition-opacity"
            :class="explorer.activeTabIndex === idx ? 'text-white/80 hover:text-white opacity-100' : 'text-fg-faint opacity-0 group-hover:opacity-100 hover:bg-bg-hover hover:text-fg-base'"
            @click.stop="explorer.closeTab(idx)"
          ><X :size="10" /></span>
        </button>
        <button class="shrink-0 p-1 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors" :title="$t('nav.newTab')" @click="explorer.addTab(explorer.currentPath || '')"><Plus :size="12" /></button>
      </div>

      <!-- toolbar -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-base">
        <ExplorerBreadcrumb />

        <ExplorerToolbar @search="searchQuery = $event" />

        <ExplorerViewModeDropdown />

        <button class="p-1.5 rounded-lg transition-colors" :class="pinned ? 'text-accent-base bg-accent-ghost' : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'" :title="$t('explorer.alwaysOnTop')" @click="togglePin"><Pin v-if="pinned" :size="14" class="pointer-events-none" /><PinOff v-else :size="14" class="pointer-events-none" /></button>

        <button class="p-1.5 rounded-lg transition-colors" :class="dupPanelOpen ? 'text-accent-base bg-accent-ghost' : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'" :title="$t('explorer.duplicates')" @click="toggleDuplicatesPanel"><Copy :size="14" class="pointer-events-none" /></button>

        <button class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors" :title="$t('explorer.newFolder')" @click="createNewFolder"><Plus :size="16" class="pointer-events-none" /></button>

        <button class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors" :title="$t('explorer.openInWindow')" @click="openInWindow"><Monitor :size="14" class="pointer-events-none" /></button>

        <span v-if="explorer.selectedCount > 0" class="text-[11px] text-fg-muted whitespace-nowrap">{{ t('explorer.nItems', { n: explorer.selectedCount }) }}</span>
      </div>

      <!-- content -->
      <div ref="scrollRef" class="flex-1 overflow-auto p-3" :class="{ 'cursor-progress': explorer.isLoading }" @contextmenu.prevent="handleEmptyContextMenu" @dragover="onContentDragOver" @dragleave="onContentDragLeave" @drop="onContentDrop" @mousedown="onBandMouseDown">
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
            <button
              :draggable="!explorer.isAtDrives"
              :data-file-path="filteredFiles[virtualRow.index].path"
              :data-folder-path="filteredFiles[virtualRow.index].isDirectory ? filteredFiles[virtualRow.index].path : undefined"
              class="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-bg-hover transition-colors text-left text-xs group relative h-full" :class="{ 'bg-accent-ghost ring-1 ring-accent-base': explorer.selectedFiles.has(filteredFiles[virtualRow.index].path), 'bg-accent-ghost/15 ring-1 ring-accent-base/30': !filteredFiles[virtualRow.index].isDirectory ? false : isLibraryFolder(filteredFiles[virtualRow.index].path) && !explorer.selectedFiles.has(filteredFiles[virtualRow.index].path), 'ring-2 ring-accent-base bg-accent-ghost/50': hoveredFolderPath && hoveredFolderPath === filteredFiles[virtualRow.index].path, 'opacity-40': fileClipboard.isCut(filteredFiles[virtualRow.index].path) }" @click="onItemClick($event, filteredFiles[virtualRow.index].path, virtualRow.index)" @dblclick="handleDoubleClick(filteredFiles[virtualRow.index])" @contextmenu.stop.prevent="handleContextMenu($event, filteredFiles[virtualRow.index])" @dragstart="(e: DragEvent) => { const p = filteredFiles[virtualRow.index].path; if (explorer.selectedFiles.has(p)) { beginFileDrag(e, [...explorer.selectedFiles]); } else { beginFileDrag(e, [p]); } }">
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
              <ExplorerGridItem :item="item" :view-mode="explorer.viewMode" :is-selected="explorer.selectedFiles.has(item.path)" :is-at-drives="explorer.isAtDrives" :is-library-folder="!item.isDirectory ? false : isLibraryFolder(item.path)" :hovered-folder-path="hoveredFolderPath" :is-cut="fileClipboard.isCut(item.path)" @select="(path: string, e: MouseEvent) => onItemClick(e, path, virtualRow.index * itemsPerRow + i)" @double-click="handleDoubleClick" @context-menu="handleContextMenu" />
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
              <ExplorerTableRow :item="filteredFiles[virtualRow.index]" :is-selected="explorer.selectedFiles.has(filteredFiles[virtualRow.index].path)" :is-at-drives="explorer.isAtDrives" :is-library-folder="!filteredFiles[virtualRow.index].isDirectory ? false : isLibraryFolder(filteredFiles[virtualRow.index].path)" :hovered-folder-path="hoveredFolderPath" :is-cut="fileClipboard.isCut(filteredFiles[virtualRow.index].path)" @select="(path: string, e: MouseEvent) => onItemClick(e, path, virtualRow.index)" @double-click="handleDoubleClick" @context-menu="handleContextMenu" />
            </div>
          </div>
        </div>

        <!-- duplicates side panel -->
        <div v-if="dupPanelOpen" class="absolute right-0 top-0 bottom-0 w-80 max-w-[85%] z-20 flex flex-col bg-bg-surface border-l border-border-default shadow-2xl">
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-border-default shrink-0">
            <h3 class="text-xs font-semibold text-fg-base flex items-center gap-2"><Copy :size="14" class="text-accent-base" /> {{ $t('explorer.duplicates') }}</h3>
            <button class="p-1 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors" @click="dupPanelOpen = false"><X :size="14" /></button>
          </div>

          <div v-if="dupLoading" class="flex flex-col items-center justify-center py-10 text-fg-faint gap-2">
            <RotateCw :size="20" class="animate-spin" />
            <p class="text-xs">{{ $t('explorer.duplicatesScanning') }}</p>
          </div>

          <div v-else-if="dupGroups.length === 0" class="flex flex-col items-center justify-center py-10 text-fg-faint gap-2">
            <Check :size="24" class="opacity-40" />
            <p class="text-xs">{{ $t('explorer.duplicatesNone') }}</p>
          </div>

          <div v-else class="flex-1 overflow-y-auto p-2 space-y-2">
            <p class="text-[11px] text-fg-muted px-1">{{ $t('explorer.duplicatesFound', { n: dupGroups.length }) }}</p>
            <div v-for="group in dupGroups" :key="group.original" class="rounded-lg border border-border-default overflow-hidden">
              <div class="flex items-center gap-2 px-2.5 py-1.5 bg-bg-elevated border-b border-border-default cursor-pointer hover:bg-bg-hover transition-colors" @click="revealDupFile(group.original)">
                <FileText :size="13" class="text-accent-base shrink-0" />
                <span class="text-xs font-medium text-fg-base truncate flex-1">{{ basenameOf(group.original) }}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-accent-base/15 text-accent-base font-semibold shrink-0">{{ $t('explorer.duplicatesOriginal') }}</span>
              </div>
              <div class="py-1">
                <div v-for="(dup, di) in group.duplicates" :key="dup" class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-hover transition-colors cursor-pointer" @click="revealDupFile(dup)">
                  <input type="checkbox" class="accent-accent-base shrink-0" :checked="dupSelected.has(dup)" @click.stop="toggleDupSelection(dup)">
                  <span class="text-xs text-fg-base truncate flex-1">{{ dupName(group, di) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="dupGroups.length > 0" class="flex items-center gap-2 px-3 py-2.5 border-t border-border-default shrink-0">
            <button class="flex-1 px-2 py-1.5 rounded-lg text-[11px] text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors" @click="selectAllDuplicates">{{ $t('explorer.duplicatesSelectAll') }}</button>
            <button class="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:pointer-events-none" :disabled="dupSelected.size === 0" @click="deleteSelectedDuplicates"><Trash2 :size="12" /> {{ $t('explorer.duplicatesDelete', { n: dupSelected.size }) }}</button>
          </div>
        </div>
      </div>

      <!-- band select overlay -->
      <div v-if="bandSelect" class="fixed pointer-events-none z-40 rounded border" :style="{ left: bandSelect.left + 'px', top: bandSelect.top + 'px', width: bandSelect.width + 'px', height: bandSelect.height + 'px', borderColor: 'rgb(99,102,241)', backgroundColor: 'rgba(99,102,241,0.08)' }" />

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

      <!-- properties dialog -->
      <Teleport to="body">
        <div v-if="propertiesItem" class="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center" @click.self="closeProperties">
          <div class="bg-bg-surface border border-border-default rounded-xl w-[440px] max-w-[92vw] shadow-2xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border-default">
              <h3 class="text-sm font-semibold text-fg-base flex items-center gap-2">
                <FolderOpen v-if="propertiesItem.isDirectory" :size="16" class="text-accent-base" />
                <FileText v-else :size="16" class="text-accent-base" />
                {{ $t('explorer.properties') }}
              </h3>
              <button class="p-1 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors" @click="closeProperties"><X :size="14" /></button>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <label class="text-[11px] text-fg-faint uppercase tracking-wider">{{ $t('explorer.name') }}</label>
                <input v-model="propertiesName" type="text" class="w-full mt-1 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-sm text-fg-base outline-none focus:ring-1 focus:ring-accent-base" @keydown.enter="applyProperties">
              </div>
              <div class="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
                <span class="text-fg-faint">{{ $t('explorer.propertiesType') }}</span>
                <span class="text-fg-base">{{ propertiesItem.isDirectory ? $t('explorer.propertiesFolder') : (propertiesItem.extension || '—') }}</span>
                <span class="text-fg-faint">{{ $t('explorer.propertiesLocation') }}</span>
                <span class="text-fg-base break-all font-mono">{{ propertiesItem.path }}</span>
                <template v-if="propertiesItem.isDirectory && propertiesData">
                  <span class="text-fg-faint">{{ $t('explorer.propertiesSize') }}</span>
                  <span class="text-fg-base">{{ formatFileSize(propertiesData.totalSize || 0) }}</span>
                  <span class="text-fg-faint">{{ $t('explorer.propertiesContains') }}</span>
                  <span class="text-fg-base">{{ $t('explorer.propertiesContainsValue', { n: propertiesData.itemCount || 0, d: propertiesData.dirCount || 0, f: propertiesData.fileCount || 0 }) }}</span>
                </template>
                <template v-else>
                  <span class="text-fg-faint">{{ $t('explorer.propertiesSize') }}</span>
                  <span class="text-fg-base">{{ formatFileSize(propertiesItem.size) }}</span>
                </template>
                <span class="text-fg-faint">{{ $t('explorer.propertiesCreated') }}</span>
                <span class="text-fg-base">{{ new Date(propertiesItem.createdAt).toLocaleString() }}</span>
                <span class="text-fg-faint">{{ $t('explorer.propertiesModified') }}</span>
                <span class="text-fg-base">{{ new Date(propertiesItem.modifiedAt).toLocaleString() }}</span>
              </div>
            </div>
            <div class="flex justify-end gap-2 px-4 py-3 border-t border-border-default">
              <button class="px-4 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-bg-hover transition-colors" @click="closeProperties">{{ $t('common.cancel') }}</button>
              <button class="px-4 py-1.5 rounded-lg text-xs bg-accent-base text-white hover:bg-accent-base/90 transition-colors" @click="applyProperties">{{ $t('common.ok') }}</button>
            </div>
          </div>
        </div>
      </Teleport>

      <ImageViewer v-if="imageViewerIndex !== null" :files="imageViewerFiles" :initial-index="imageViewerIndex ?? 0" @close="closeImageViewer" />
    </div>
  </div>
</template>