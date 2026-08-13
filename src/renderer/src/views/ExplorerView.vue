<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, provide } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Monitor, Plus, Pin, PinOff, Copy } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useClipboardStore } from '@renderer/stores/clipboard';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { handleTabDrop } from '@renderer/utils/explorerTabDrop';
import { IMAGE_EXTS } from '@shared/constants';
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
import { useExplorerActions } from '@renderer/composables/useExplorerActions';
import { useExplorerContextMenu } from '@renderer/composables/useExplorerContextMenu';
import type { FileItem } from '@renderer/types/explorer';

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
const searchQuery = ref('');
const imageViewerIndex = ref<number | null>(null);
const imageViewerFiles = ref<FileItem[]>([]);
const dupPanelOpen = ref(false);
const propertiesItem = ref<FileItem | null>(null);
const contentRef = ref<InstanceType<typeof ExplorerContent> | null>(null);

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);

const filteredFiles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return explorer.sortedFiles;
  return explorer.sortedFiles.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.extension || '').toLowerCase().includes(q)
  );
});

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

async function openImageViewer(index: number) {
  // Images are served through the local media server — grant access to the
  // current folder before the viewer requests the URLs.
  if (explorer.currentPath) await window.api?.grantMediaAccess(explorer.currentPath);
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

function openProperties(item: FileItem) {
  propertiesItem.value = item;
}

function onPropertiesRenamed() {
  explorer.loadFiles(explorer.currentPath);
}

const actions = useExplorerActions({
  explorer,
  fileClipboard,
  player,
  ui,
  t,
  router,
  filteredFiles,
  showPrompt,
  showConfirm,
  openImageViewer,
  openProperties,
  openInWindow
});

async function createNewFolder() {
  const name = await showPrompt(t('explorer.newFolder'));
  if (!name || !name.trim()) return;
  const path = explorer.currentPath ? explorer.currentPath + '\\' + name.trim() : name.trim();
  const ok = await window.api?.invoke('fs:mkdir', path);
  if (ok) explorer.loadFiles(explorer.currentPath);
}

async function openInWindow() {
  await window.api?.invoke('explorer:create', explorer.currentPath || undefined);
}

const contextMenu = useExplorerContextMenu({
  explorer,
  fileClipboard,
  library,
  ui,
  t,
  filteredFiles,
  openImageViewer,
  openProperties,
  playItem: actions.playItem,
  addToQueueItem: actions.addToQueueItem,
  navigateTo: (path: string) => explorer.navigateTo(path),
  copySelectedPaths: actions.copySelectedPaths,
  cutSelectedPaths: actions.cutSelectedPaths,
  pasteClipboard: actions.pasteClipboard,
  createNewFolder,
  renameItem: actions.renameItem,
  deleteItem: actions.deleteItem
});

function onWheel(e: WheelEvent) {
  if (e.ctrlKey) {
    e.preventDefault();
    if (e.deltaY < 0) explorer.prevViewMode();
    else explorer.nextViewMode();
  }
}

function handleDoubleClick(item: FileItem) {
  actions.playItem(item);
}

async function onWindowTabDrop(e: DragEvent) {
  const raw = e.dataTransfer?.getData('text/plain') || '';
  await handleTabDrop(raw);
}

function onContentMenu(event: MouseEvent, item: FileItem | null) {
  if (item) contextMenu.handleContextMenu(event, item);
  else contextMenu.handleEmptyContextMenu(event);
}

onMounted(() => {
  if (explorer.tabs.length === 0) explorer.addTab(explorer.currentPath || '');
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', actions.onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', actions.onKeydown);
});
</script>

<template>
  <div class="flex h-full" @dragover.prevent @drop.prevent="onWindowTabDrop">
    <ExplorerNavPane />
    <div class="flex flex-col flex-1 min-w-0 relative" @dragover.prevent @drop.prevent>
      <ExplorerTabs />

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
          :aria-label="$t('explorer.alwaysOnTop')"
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
          :aria-label="$t('explorer.duplicates')"
          @click="toggleDuplicatesPanel"
        >
          <Copy :size="14" class="pointer-events-none" />
        </button>

        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :title="$t('explorer.newFolder')"
          :aria-label="$t('explorer.newFolder')"
          @click="createNewFolder"
        >
          <Plus :size="16" class="pointer-events-none" />
        </button>

        <button
          class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :title="$t('explorer.openInWindow')"
          :aria-label="$t('explorer.openInWindow')"
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

      <ExplorerContent
        ref="contentRef"
        :files="filteredFiles"
        @open="handleDoubleClick"
        @menu="onContentMenu"
      />

      <ExplorerDuplicatesPanel v-model:open="dupPanelOpen" @reveal="revealDupFile" />

      <ExplorerPromptDialog
        v-model:value="promptValue"
        :visible="promptVisible"
        :is-confirm="promptIsConfirm"
        :message="promptMessage"
        @confirm="promptConfirm"
        @cancel="promptCancel"
      />

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
