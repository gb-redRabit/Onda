<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, provide, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Monitor, Plus, Pin, PinOff, Copy, Eye, EyeOff, PanelLeft, Info } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useSettingsStore } from '@renderer/stores/settings';
import { clonePlain } from '@renderer/utils/clone';
import { joinPath } from '@renderer/utils/path';
import { useClipboardStore } from '@renderer/stores/clipboard';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { useAlwaysOnTop } from '@renderer/composables/useAlwaysOnTop';
import { handleTabDrop } from '@renderer/utils/explorerTabDrop';
import { IMAGE_EXTS } from '@shared/constants';
import ExplorerNavPane from '@renderer/components/explorer/ExplorerNavPane.vue';
import ExplorerToolbar from '@renderer/components/explorer/ExplorerToolbar.vue';
import ExplorerBreadcrumb from '@renderer/components/explorer/ExplorerBreadcrumb.vue';
import ExplorerViewModeDropdown from '@renderer/components/explorer/ExplorerViewModeDropdown.vue';
import ExplorerContent from '@renderer/components/explorer/ExplorerContent.vue';
import ExplorerTabs from '@renderer/components/explorer/ExplorerTabs.vue';
import ExplorerDuplicatesPanel from '@renderer/components/explorer/ExplorerDuplicatesPanel.vue';
import ExplorerDetailsPane from '@renderer/components/explorer/ExplorerDetailsPane.vue';
import ExplorerPropertiesDialog from '@renderer/components/explorer/ExplorerPropertiesDialog.vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import { useExplorerActions } from '@renderer/composables/useExplorerActions';
import { useExplorerContextMenu } from '@renderer/composables/useExplorerContextMenu';
import { useViewSearch } from '@renderer/composables/useViewSearch';
import type { FileItem } from '@renderer/types/explorer';

const explorer = useExplorerStore();
const settings = useSettingsStore();
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

const { pinned, togglePin } = useAlwaysOnTop();
const searchQuery = ref('');
useViewSearch(searchQuery);
const dupPanelOpen = ref(false);
const propertiesItem = ref<FileItem | null>(null);
const contentRef = ref<InstanceType<typeof ExplorerContent> | null>(null);

// Panel szczegółów: pokazuje pojedyncze zaznaczenie i przeżywa przeładowanie
// listy (dlatego stan jest w pamięci, a nie w selekcji). Domyślnie zamknięty.
const detailsOpen = ref(readDetailsOpen());
const detailItem = computed<FileItem | null>(() => {
  if (explorer.selectedCount !== 1) return null;
  const [path] = [...explorer.selectedFiles];
  return explorer.sortedFiles.find((file) => file.path === path) ?? null;
});

function readDetailsOpen(): boolean {
  try {
    return localStorage.getItem('onda-explorer-details') === '1';
  } catch {
    return false;
  }
}

function toggleDetails(): void {
  detailsOpen.value = !detailsOpen.value;
  try {
    localStorage.setItem('onda-explorer-details', detailsOpen.value ? '1' : '0');
  } catch {
    /* brak storage — panel działa nadal, tylko nie pamięta stanu */
  }
}

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);

// W wąskim oknie panel nawigacji zabierałby połowę szerokości na listę plików,
// więc domyślnie się zwija. Użytkownik może go otworzyć — wtedy pokazuje się
// jako nakładka, a przejście do folderu ponownie go zwija.
const NAV_BREAKPOINT = 1024;
const narrowWindow = ref(window.innerWidth < NAV_BREAKPOINT);
const navPreference = ref<'auto' | 'open' | 'closed'>('auto');

const showNav = computed(() => {
  if (navPreference.value === 'open') return true;
  if (navPreference.value === 'closed') return false;
  return !narrowWindow.value;
});

function toggleNav(): void {
  navPreference.value = showNav.value ? 'closed' : 'open';
}

function onWindowResize(): void {
  narrowWindow.value = window.innerWidth < NAV_BREAKPOINT;
  // Po powrocie do szerokiego okna wracamy do układu domyślnego.
  if (!narrowWindow.value) navPreference.value = 'auto';
}

watch(
  () => explorer.currentPath,
  () => {
    if (narrowWindow.value) navPreference.value = 'auto';
  }
);

const filteredFiles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return explorer.sortedFiles;
  return explorer.sortedFiles.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.extension || '').toLowerCase().includes(q)
  );
});

function toggleDuplicatesPanel() {
  dupPanelOpen.value = !dupPanelOpen.value;
}

// Przełącznik plików ukrytych/systemowych: zmiana ustawienia + przeładowanie
// bieżącego folderu, żeby lista od razu odzwierciedlała wybór.
async function toggleHiddenFiles(): Promise<void> {
  settings.updateExplorer({ showHidden: !settings.explorer.showHidden });
  await explorer.loadFiles(explorer.currentPath);
}

function revealDupFile(path: string) {
  contentRef.value?.reveal(path);
}

async function openImageViewer(index: number) {
  // Obrazy są serwowane przez lokalny serwer mediów — przed żądaniem URL-i przez
  // przeglądarkę przyznaj dostęp do bieżącego folderu.
  if (explorer.currentPath) await window.api?.grantMediaAccess(explorer.currentPath);
  const files = filteredFiles.value.filter(
    (f) => !f.isDirectory && f.extension && IMAGE_EXT_SET.has(f.extension)
  );
  const actualIndex = files.findIndex((f) => f.path === filteredFiles.value[index].path);
  const plain = clonePlain(files);
  window.api?.invoke('imageViewer:open', plain, actualIndex >= 0 ? actualIndex : 0);
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
  const path = joinPath(explorer.currentPath, name.trim());
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
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', actions.onKeydown);
  window.removeEventListener('resize', onWindowResize);
});
</script>

<template>
  <div
    data-testid="explorer-view"
    class="relative flex h-full"
    @dragover.prevent
    @drop.prevent="onWindowTabDrop"
  >
    <ExplorerNavPane
      v-if="showNav"
      :overlay="narrowWindow"
      :class="narrowWindow ? 'absolute inset-y-0 left-0 z-30 fx-depth' : ''"
      @close="toggleNav"
    />
    <div
      v-if="narrowWindow && showNav"
      class="absolute inset-0 z-20 bg-neutral/35"
      @click.self="toggleNav"
    />
    <div class="flex flex-col flex-1 min-w-0 relative" @dragover.prevent @drop.prevent>
      <ExplorerTabs />

      <div
        class="ui-page-toolbar relative z-20 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-hairline bg-base-200/(--glass-alpha)"
      >
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            showNav
              ? 'text-primary-text bg-primary/10'
              : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
          "
          data-testid="explorer-toggle-nav"
          :title="$t('explorer.toggleNav')"
          :aria-label="$t('explorer.toggleNav')"
          :aria-pressed="showNav"
          @click="toggleNav"
        >
          <PanelLeft :size="14" class="pointer-events-none" />
        </button>

        <ExplorerBreadcrumb />

        <ExplorerToolbar @search="searchQuery = $event" />

        <ExplorerViewModeDropdown />

        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            pinned
              ? 'text-primary-text bg-primary/10'
              : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
          "
          data-testid="explorer-always-on-top"
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
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            detailsOpen
              ? 'text-primary-text bg-primary/10'
              : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
          "
          data-testid="explorer-details-toggle"
          :title="$t('explorer.detailsTitle')"
          :aria-label="$t('explorer.detailsTitle')"
          :aria-pressed="detailsOpen"
          @click="toggleDetails"
        >
          <Info :size="14" class="pointer-events-none" />
        </button>

        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            dupPanelOpen
              ? 'text-primary-text bg-primary/10'
              : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
          "
          data-testid="explorer-duplicates"
          :title="$t('explorer.duplicates')"
          :aria-label="$t('explorer.duplicates')"
          @click="toggleDuplicatesPanel"
        >
          <Copy :size="14" class="pointer-events-none" />
        </button>

        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="
            settings.explorer.showHidden
              ? 'bg-primary/12 text-primary-text'
              : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
          "
          data-testid="explorer-show-hidden"
          :title="$t('settings.showHidden')"
          :aria-label="$t('settings.showHidden')"
          :aria-pressed="settings.explorer.showHidden"
          @click="toggleHiddenFiles"
        >
          <Eye v-if="settings.explorer.showHidden" :size="14" class="pointer-events-none" />
          <EyeOff v-else :size="14" class="pointer-events-none" />
        </button>

        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
          data-testid="explorer-new-folder"
          :title="$t('explorer.newFolder')"
          :aria-label="$t('explorer.newFolder')"
          @click="createNewFolder"
        >
          <Plus :size="16" class="pointer-events-none" />
        </button>

        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
          data-testid="explorer-open-window"
          :title="$t('explorer.openInWindow')"
          :aria-label="$t('explorer.openInWindow')"
          @click="openInWindow"
        >
          <Monitor :size="14" class="pointer-events-none" />
        </button>

        <span
          v-if="explorer.selectedCount > 0"
          class="text-2xs text-base-content/70 whitespace-nowrap"
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
    </div>

    <ExplorerDetailsPane
      v-if="detailsOpen"
      :item="detailItem"
      :selected-count="explorer.selectedCount"
      :class="narrowWindow ? 'absolute inset-y-0 right-0 z-30 fx-depth' : ''"
      @close="toggleDetails"
      @properties="openProperties"
    />
  </div>
</template>
