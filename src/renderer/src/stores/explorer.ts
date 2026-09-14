import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { FileItem, ViewMode, SortBy, SortOrder } from '@renderer/types/explorer';
import { VIEW_MODES } from '@renderer/types/explorer';
import { useSettingsStore } from './settings';
import { isDrivePath, parentPath } from '@renderer/utils/explorerPath';
import { sortFiles } from '@renderer/utils/explorerSort';
import { createBatchLoader } from '@renderer/utils/explorerLoader';
import { createExplorerTabs } from './explorer-tabs';

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

  const { tabs, activeTabIndex, addTab, closeTab, switchTab, reorderTab, syncActiveTab } =
    createExplorerTabs(navigateTo);

  const isAtDrives = computed(() => isDrivePath(currentPath.value));
  const canGoBack = computed(() => historyIndex.value > 0);
  const canGoForward = computed(() => historyIndex.value < history.value.length - 1);
  const canGoUp = computed(() => currentPath.value !== '' && !isAtDrives.value);
  const selectedCount = computed(() => selectedFiles.value.size);

  // During a batched load don't re-sort on every batch (O(n² log n) for large
  // dirs). Show the raw order while loading and sort once when it finishes (or
  // whenever the sort order changes outside a load) — plan 1.5.
  const sortedFiles = computed(() =>
    isLoading.value ? files.value : sortFiles(files.value, sortBy.value, sortOrder.value)
  );

  function navigateTo(path: string) {
    currentPath.value = path;
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push(path);
    historyIndex.value = history.value.length - 1;
    selectedFiles.value.clear();
    loadFiles(path);
  }

  function goBack() {
    if (!canGoBack.value) return;
    historyIndex.value--;
    currentPath.value = history.value[historyIndex.value];
    selectedFiles.value.clear();
    loadFiles(currentPath.value);
  }

  function goForward() {
    if (!canGoForward.value) return;
    historyIndex.value++;
    currentPath.value = history.value[historyIndex.value];
    selectedFiles.value.clear();
    loadFiles(currentPath.value);
  }

  function goUp() {
    if (canGoUp.value) navigateTo(parentPath(currentPath.value));
  }

  const batchLoader = createBatchLoader(files, isLoading);

  async function loadFiles(path: string) {
    await batchLoader.load(path);
  }

  function toggleSelect(path: string) {
    if (selectedFiles.value.has(path)) selectedFiles.value.delete(path);
    else selectedFiles.value.add(path);
  }

  function selectAll() {
    sortedFiles.value.forEach((f) => selectedFiles.value.add(f.path));
  }

  function clearSelection() {
    selectedFiles.value.clear();
  }

  const viewModeIndex = computed(() => VIEW_MODES.indexOf(viewMode.value));

  function nextViewMode() {
    viewMode.value = VIEW_MODES[(viewModeIndex.value + 1) % VIEW_MODES.length];
  }

  function prevViewMode() {
    viewMode.value = VIEW_MODES[(viewModeIndex.value - 1 + VIEW_MODES.length) % VIEW_MODES.length];
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
  watch(currentPath, (path) => syncActiveTab(path));

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
