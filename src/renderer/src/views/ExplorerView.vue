<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, provide } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Monitor, Plus, Pin, PinOff, Copy } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useClipboardStore } from '@renderer/stores/clipboard';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore, ContextMenuItem } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { handleTabDrop } from '@renderer/utils/explorerTabDrop';
import { isLibraryFolder } from '@renderer/utils/libraryFolders';
import { AUDIO_EXTS, VIDEO_EXTS, IMAGE_EXTS } from '@shared/constants';
import ExplorerNavPane from '@renderer/components/explorer/ExplorerNavPane.vue';
import ExplorerToolbar from '@renderer/components/explorer/ExplorerToolbar.vue';
import ExplorerBreadcrumb from '@renderer/components/explorer/ExplorerBreadcrumb.vue';
import ExplorerViewModeDropdown from '@renderer/components/explorer/ExplorerViewModeDropdown.vue';
import ExplorerContent from '@renderer/components/explorer/ExplorerContent.vue';
import ExplorerTabs from '@renderer/components/explorer/ExplorerTabs.vue';
import ExplorerDuplicatesPanel from '@renderer/components/explorer/ExplorerDuplicatesPanel.vue';
import ExplorerPropertiesDialog from '@renderer/components/explorer/ExplorerPropertiesDialog.vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import ImageViewer from '@renderer/components/explorer/ImageViewer.vue';
import type { FileItem } from '@renderer/types/explorer';
import type { MediaFile } from '@renderer/types/media';

const explorer = useExplorerStore();
const fileClipboard = useClipboardStore();
const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();
const { t } = useI18n();

const {
  showPrompt,
  showConfirm,
  promptVisible,
  promptIsConfirm,
  promptMessage,
  promptValue,
  promptConfirm,
  promptCancel
} = usePromptDialog();

provide('showConfirm', showConfirm);

const pinned = ref(false);

function togglePin() {
  pinned.value = !pinned.value;
  window.api?.invoke('window:setAlwaysOnTop', pinned.value);
}

function toggleDuplicatesPanel() {
  dupPanelOpen.value = !dupPanelOpen.value;
}

function revealDupFile(path: string) {
  contentRef.value?.reveal(path);
}

const contentRef = ref<InstanceType<typeof ExplorerContent> | null>(null);

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);
const VIDEO_EXT_SET = new Set(VIDEO_EXTS);

const MEDIA_EXT_SET = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);

const searchQuery = ref('');
const imageViewerIndex = ref<number | null>(null);
const imageViewerFiles = ref<FileItem[]>([]);

// duplicate finder state
const dupPanelOpen = ref(false);

// properties dialog state
const propertiesItem = ref<FileItem | null>(null);

const filteredFiles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return explorer.sortedFiles;
  return explorer.sortedFiles.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.extension || '').toLowerCase().includes(q)
  );
});

onMounted(() => {
  if (explorer.tabs.length === 0) explorer.addTab(explorer.currentPath || '');
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', handleKeydown);
});

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
  const msg =
    items.length === 1
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
    (f) => !f.isDirectory && f.extension && IMAGE_EXT_SET.has(f.extension)
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

function handleDoubleClick(item: FileItem) {
  if (item.isDirectory) {
    explorer.navigateTo(item.path);
  } else if (item.extension && IMAGE_EXT_SET.has(item.extension)) {
    const idx = filteredFiles.value.findIndex((f) => f.path === item.path);
    openImageViewer(idx);
  } else if (item.extension && MEDIA_EXT_SET.has(item.extension)) {
    const isVideo = VIDEO_EXT_SET.has(item.extension);
    const track: MediaFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: item.path,
      name: item.name,
      type: isVideo ? 'video' : 'audio',
      size: item.size,
      duration: 0,
      extension: item.extension,
      mimeType: '',
      addedAt: Date.now(),
      playCount: 0
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
  items.push({
    label: t('explorer.openInTerminal'),
    action: () => window.api?.invoke('shell:openTerminal', explorer.currentPath)
  });
  pushSeparator(items);
  items.push({
    label: t('explorer.openWithDefaultApp'),
    action: () => window.api?.invoke('shell:openWithDefault', explorer.currentPath)
  });
  items.push({
    label: t('common.showInFolder'),
    action: () => window.api?.invoke('shell:showItemInFolder', explorer.currentPath)
  });
  pushSeparator(items);
  items.push({
    label: t('common.selectAll'),
    action: () => {
      explorer.clearSelection();
      filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path));
    },
    shortcut: 'Ctrl+A'
  });
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
    items.push({
      label: t('explorer.open'),
      action: () => explorer.navigateTo(item.path),
      shortcut: 'Enter'
    });
    pushSeparator(items);
    const alreadyInLibrary = isLibraryFolder(item.path);
    items.push({
      label: alreadyInLibrary ? t('explorer.removeFromLibrary') : t('explorer.addToLibrary'),
      action: () => {
        if (alreadyInLibrary) library.removeFolder(item.path);
        else library.addFolder(item.path);
      }
    });
    items.push({
      label: t('explorer.openInTerminal'),
      action: () => window.api?.invoke('shell:openTerminal', item.path)
    });
    items.push({
      label: t('explorer.openWithDefaultApp'),
      action: () => window.api?.invoke('shell:openWithDefault', item.path)
    });
    items.push({
      label: t('explorer.copyPath'),
      action: () => window.api?.invoke('fs:copyPath', item.path),
      shortcut: 'Ctrl+C'
    });
    items.push({
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', item.path)
    });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({
      label: t('common.delete'),
      disabled: isLibraryFolder(item.path),
      action: () => deleteItem(item),
      shortcut: 'Del'
    });
  } else if (item.extension && IMAGE_EXT_SET.has(item.extension)) {
    items.push({
      label: t('explorer.openImage'),
      action: () => {
        const idx = filteredFiles.value.findIndex((f) => f.path === item.path);
        openImageViewer(idx);
      },
      shortcut: 'Enter'
    });
    pushSeparator(items);
    items.push({
      label: t('explorer.openWithDefaultApp'),
      action: () => window.api?.invoke('shell:openWithDefault', item.path)
    });
    items.push({
      label: t('explorer.copyPath'),
      action: () => window.api?.invoke('fs:copyPath', item.path),
      shortcut: 'Ctrl+C'
    });
    items.push({
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', item.path)
    });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), action: () => deleteItem(item), shortcut: 'Del' });
  } else if (item.extension && MEDIA_EXT_SET.has(item.extension)) {
    const isVideo = VIDEO_EXT_SET.has(item.extension);
    items.push({
      label: t('common.play'),
      action: () => handleDoubleClick(item),
      shortcut: 'Enter'
    });
    items.push({
      label: t('common.addToQueue'),
      action: () => {
        const mf: MediaFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          path: item.path,
          name: item.name,
          type: isVideo ? 'video' : 'audio',
          size: item.size,
          duration: 0,
          extension: item.extension || '',
          mimeType: '',
          addedAt: Date.now(),
          playCount: 0
        };
        player.addToQueue(mf);
      }
    });
    pushSeparator(items);
    items.push({
      label: t('explorer.openWithDefaultApp'),
      action: () => window.api?.invoke('shell:openWithDefault', item.path)
    });
    items.push({
      label: t('explorer.copyPath'),
      action: () => window.api?.invoke('fs:copyPath', item.path),
      shortcut: 'Ctrl+C'
    });
    items.push({
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', item.path)
    });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), action: () => deleteItem(item), shortcut: 'Del' });
  } else {
    items.push({
      label: t('explorer.openWithDefaultApp'),
      action: () => window.api?.invoke('shell:openWithDefault', item.path)
    });
    items.push({
      label: t('explorer.copyPath'),
      action: () => window.api?.invoke('fs:copyPath', item.path),
      shortcut: 'Ctrl+C'
    });
    pushSeparator(items);
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({ label: t('common.delete'), action: () => deleteItem(item), shortcut: 'Del' });
    pushSeparator(items);
    items.push({
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', item.path)
    });
  }

  pushSeparator(items);
  items.push({
    label: t('explorer.properties'),
    action: () => openProperties(item),
    shortcut: 'Alt+Enter'
  });
  pushSeparator(items);
  items.push({
    label: t('common.selectAll'),
    action: () => {
      explorer.clearSelection();
      filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path));
    },
    shortcut: 'Ctrl+A'
  });
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
function openProperties(item: FileItem) {
  propertiesItem.value = item;
}

function onPropertiesRenamed() {
  explorer.loadFiles(explorer.currentPath);
}

// --- outer window tab drop ---
async function onWindowTabDrop(e: DragEvent) {
  const raw = e.dataTransfer?.getData('text/plain') || '';
  await handleTabDrop(raw);
}

function onContentMenu(event: MouseEvent, item: FileItem | null) {
  if (item) handleContextMenu(event, item);
  else handleEmptyContextMenu(event);
}
</script>

<template>
  <div class="flex h-full" @dragover.prevent @drop.prevent="onWindowTabDrop">
    <ExplorerNavPane />
    <div class="flex flex-col flex-1 min-w-0 relative" @dragover.prevent @drop.prevent>
      <!-- tab bar -->
      <ExplorerTabs />

      <!-- toolbar -->
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-base">
        <ExplorerBreadcrumb />

        <ExplorerToolbar @search="searchQuery = $event" />

        <ExplorerViewModeDropdown />

        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            pinned
              ? 'text-accent-base bg-accent-ghost'
              : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
          "
          :title="$t('explorer.alwaysOnTop')"
          @click="togglePin"
        >
          <Pin v-if="pinned" :size="14" class="pointer-events-none" /><PinOff
            v-else
            :size="14"
            class="pointer-events-none"
          />
        </button>

        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            dupPanelOpen
              ? 'text-accent-base bg-accent-ghost'
              : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
          "
          :title="$t('explorer.duplicates')"
          @click="toggleDuplicatesPanel"
        >
          <Copy :size="14" class="pointer-events-none" />
        </button>

        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :title="$t('explorer.newFolder')"
          @click="createNewFolder"
        >
          <Plus :size="16" class="pointer-events-none" />
        </button>

        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :title="$t('explorer.openInWindow')"
          @click="openInWindow"
        >
          <Monitor :size="14" class="pointer-events-none" />
        </button>

        <span
          v-if="explorer.selectedCount > 0"
          class="text-[11px] text-fg-muted whitespace-nowrap"
          >{{ t('explorer.nItems', { n: explorer.selectedCount }) }}</span
        >
      </div>

      <!-- content -->
      <ExplorerContent
        ref="contentRef"
        :files="filteredFiles"
        @open="handleDoubleClick"
        @menu="onContentMenu"
      />

      <!-- duplicates side panel -->
      <ExplorerDuplicatesPanel
        v-model:open="dupPanelOpen"
        @reveal="revealDupFile"
      />

      <!-- prompt dialog -->
      <ExplorerPromptDialog
        v-model:value="promptValue"
        :visible="promptVisible"
        :is-confirm="promptIsConfirm"
        :message="promptMessage"
        @confirm="promptConfirm"
        @cancel="promptCancel"
      />

      <!-- properties dialog -->
      <ExplorerPropertiesDialog
        v-if="propertiesItem"
        :item="propertiesItem"
        @close="propertiesItem = null"
        @renamed="onPropertiesRenamed"
      />

      <ImageViewer
        v-if="imageViewerIndex !== null"
        :files="imageViewerFiles"
        :initial-index="imageViewerIndex ?? 0"
        @close="closeImageViewer"
      />
    </div>
  </div>
</template>
