import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { FileItem, ViewMode, SortBy, SortOrder, ExplorerTab } from '@renderer/types/explorer';
import { VIEW_MODES } from '@renderer/types/explorer';
import { useSettingsStore } from './settings';
import { useUIStore } from './ui';

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
  const settings = useSettingsStore();
  const currentPath = ref('');
  const files = ref<FileItem[]>([]);
  const selectedFiles = ref<Set<string>>(new Set());
  const viewMode = ref<ViewMode>(settings.explorer.viewMode);
  const sortBy = ref<SortBy>(settings.explorer.sortBy);
  const sortOrder = ref<SortOrder>(settings.explorer.sortOrder);
  const history = ref<string[]>([]);
  const historyIndex = ref(-1);
  const isLoading = ref(false);

  const tabs = ref<ExplorerTab[]>([]);
  const activeTabIndex = ref(-1);

  function addTab(path: string) {
    const existing = tabs.value.findIndex(
      (t, idx) => t.path === path && idx !== activeTabIndex.value
    );
    if (existing >= 0) {
      switchTab(existing);
      return;
    }
    const label = path ? path.split('\\').filter(Boolean).pop() || path : '';
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tabs.value.push({ id, path, label });
    switchTab(tabs.value.length - 1);
  }

  function closeTab(index: number) {
    if (tabs.value.length <= 1) return;
    tabs.value.splice(index, 1);
    if (activeTabIndex.value === index) {
      const newIdx = Math.min(index, tabs.value.length - 1);
      switchTab(newIdx);
    } else if (activeTabIndex.value > index) {
      activeTabIndex.value--;
    }
  }

  function switchTab(index: number) {
    if (index < 0 || index >= tabs.value.length) return;
    activeTabIndex.value = index;
    const tab = tabs.value[index];
    navigateTo(tab.path);
  }

  function reorderTab(from: number, to: number) {
    if (from < 0 || from >= tabs.value.length || to < 0 || to >= tabs.value.length) return;
    if (from === to) return;
    const [tab] = tabs.value.splice(from, 1);
    tabs.value.splice(to, 0, tab);
    const active = activeTabIndex.value;
    if (active === from) {
      activeTabIndex.value = to;
    } else if (active > from && active <= to) {
      activeTabIndex.value = active - 1;
    } else if (active < from && active >= to) {
      activeTabIndex.value = active + 1;
    }
  }

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
  let currentLoadId = 0;

  async function loadFiles(path: string) {
    const loadId = ++currentLoadId;
    files.value = [];
    isLoading.value = true;
    batchCleanup?.();
    if (!window.api) {
      isLoading.value = false;
      return;
    }
    const stopListening = window.api.on('fs:readdir:batch', (...args: unknown[]) => {
      if (loadId !== currentLoadId) {
        stopListening();
        return;
      }
      const data = args[0] as { done: boolean; items: FileItem[]; error?: string };
      if (data.error) {
        useUIStore().notify('error', 'Błąd odczytu folderu', data.error);
      }
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
      if (loadId === currentLoadId) {
        files.value = [];
        isLoading.value = false;
        stopListening();
        batchCleanup = null;
      }
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

  watch(viewMode, (val) => settings.updateExplorer({ viewMode: val }));
  watch(sortBy, (val) => settings.updateExplorer({ sortBy: val }));
  watch(sortOrder, (val) => settings.updateExplorer({ sortOrder: val }));
  watch(currentPath, (path) => {
    if (activeTabIndex.value >= 0 && tabs.value[activeTabIndex.value]) {
      tabs.value[activeTabIndex.value].path = path;
      tabs.value[activeTabIndex.value].label = path
        ? path.split('\\').filter(Boolean).pop() || path
        : '';
    }
  });

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
    tabs,
    activeTabIndex,
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
    toggleSort,
    addTab,
    closeTab,
    switchTab,
    reorderTab
  };
});
