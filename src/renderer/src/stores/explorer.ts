import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FileItem, ViewMode, SortBy, SortOrder } from '@renderer/types/explorer';
import { VIEW_MODES } from '@renderer/types/explorer';

function isDrivePath(p: string): boolean {
  return /^[A-Z]:\\?$/i.test(p) || p === '';
}

function parentPath(p: string): string {
  if (!p || isDrivePath(p)) return '';
  const cleaned = p.replace(/[\\\/]$/, '');
  const idx = cleaned.lastIndexOf('\\');
  if (idx < 0) return '';
  const parent = cleaned.substring(0, idx);
  if (isDrivePath(parent)) return parent;
  return parent;
}

export const useExplorerStore = defineStore('explorer', () => {
  const currentPath = ref('');
  const files = ref<FileItem[]>([]);
  const selectedFiles = ref<Set<string>>(new Set());
  const viewMode = ref<ViewMode>('medium');
  const sortBy = ref<SortBy>('name');
  const sortOrder = ref<SortOrder>('asc');
  const history = ref<string[]>([]);
  const historyIndex = ref(-1);
  const isLoading = ref(false);
  const sidebarWidth = ref(250);

  const isAtDrives = computed(() => isDrivePath(currentPath.value));
  const canGoBack = computed(() => historyIndex.value > 0);
  const canGoForward = computed(() => historyIndex.value < history.value.length - 1);
  const canGoUp = computed(() => currentPath.value !== '' && !isAtDrives.value);
  const selectedCount = computed(() => selectedFiles.value.size);

  const sortedFiles = computed(() => {
    const sorted = [...files.value].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      let cmp = 0;
      switch (sortBy.value) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'modified':
          cmp = a.modifiedAt - b.modifiedAt;
          break;
        case 'type':
          cmp = (a.extension || '').localeCompare(b.extension || '');
          break;
      }
      return sortOrder.value === 'asc' ? cmp : -cmp;
    });
    return sorted;
  });

  function navigateTo(path: string) {
    currentPath.value = path;
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push(path);
    historyIndex.value = history.value.length - 1;
    selectedFiles.value.clear();
    loadFiles(path);
  }

  function goBack() {
    if (canGoBack.value) {
      historyIndex.value--;
      currentPath.value = history.value[historyIndex.value];
      selectedFiles.value.clear();
      loadFiles(currentPath.value);
    }
  }

  function goForward() {
    if (canGoForward.value) {
      historyIndex.value++;
      currentPath.value = history.value[historyIndex.value];
      selectedFiles.value.clear();
      loadFiles(currentPath.value);
    }
  }

  function goUp() {
    if (canGoUp.value) {
      const parent = parentPath(currentPath.value);
      navigateTo(parent);
    }
  }

  let batchCleanup: (() => void) | null = null;

  async function loadFiles(path: string) {
    files.value = [];
    isLoading.value = true;
    batchCleanup?.();
    if (!window.api) { isLoading.value = false; return; }
    const stopListening = window.api.on('fs:readdir:batch', (...args: unknown[]) => {
      const data = args[0] as { done: boolean; items: FileItem[] };
      if (data.items.length > 0) {
        files.value = [...files.value, ...data.items];
      }
      if (data.done) {
        isLoading.value = false;
        stopListening();
        batchCleanup = null;
      }
    });
    batchCleanup = stopListening;
    try {
      await window.api.invoke('fs:readdir', path);
    } catch {
      files.value = [];
      isLoading.value = false;
      stopListening();
      batchCleanup = null;
    }
  }

  function toggleSelect(path: string) {
    if (selectedFiles.value.has(path)) {
      selectedFiles.value.delete(path);
    } else {
      selectedFiles.value.add(path);
    }
  }

  function selectAll() {
    sortedFiles.value.forEach((f) => selectedFiles.value.add(f.path));
  }

  function clearSelection() {
    selectedFiles.value.clear();
  }

  const viewModeIndex = computed(() => VIEW_MODES.indexOf(viewMode.value));

  function nextViewMode() {
    const idx = viewModeIndex.value;
    viewMode.value = VIEW_MODES[(idx + 1) % VIEW_MODES.length];
  }

  function prevViewMode() {
    const idx = viewModeIndex.value;
    viewMode.value = VIEW_MODES[(idx - 1 + VIEW_MODES.length) % VIEW_MODES.length];
  }

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode;
  }

  function toggleSort(field: SortBy) {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy.value = field;
      sortOrder.value = 'asc';
    }
  }

  return {
    currentPath,
    files,
    selectedFiles,
    viewMode,
    viewModeIndex,
    sortBy,
    sortOrder,
    history,
    historyIndex,
    isLoading,
    sidebarWidth,
    isAtDrives,
    canGoBack,
    canGoForward,
    canGoUp,
    selectedCount,
    sortedFiles,
    navigateTo,
    goBack,
    goForward,
    goUp,
    loadFiles,
    toggleSelect,
    selectAll,
    clearSelection,
    nextViewMode,
    prevViewMode,
    setViewMode,
    toggleSort
  };
});
