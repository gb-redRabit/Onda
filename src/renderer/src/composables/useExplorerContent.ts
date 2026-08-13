import { ref, computed, onMounted } from 'vue';
import type { Ref } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useClipboardStore } from '@renderer/stores/clipboard';
import { useSettingsStore } from '@renderer/stores/settings';
import { useFileIcons } from '@renderer/composables/useFileIcons';
import { useExplorerDrop } from '@renderer/composables/useExplorerDrop';
import { useExplorerBandSelect } from '@renderer/composables/useExplorerBandSelect';
import type { FileItem } from '@renderer/types/explorer';

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

export function useExplorerContent(
  props: { files: FileItem[] },
  showConfirm: (msg: string) => Promise<boolean>,
  scrollRef: Ref<HTMLDivElement | null>
) {
  const explorer = useExplorerStore();
  const fileClipboard = useClipboardStore();
  const settings = useSettingsStore();

  const files = computed(() => props.files);
  const containerWidth = ref(800);
  const selectionAnchorIndex = ref(-1);

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

  const { extraSmallIcon } = useFileIcons();

  const { contentRef, hoveredFolderPath, onContentDragOver, onContentDragLeave, onContentDrop } =
    useExplorerDrop(explorer, settings, showConfirm);

  const { bandSelect, onBandMouseDown } = useExplorerBandSelect(scrollRef, explorer);

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

  function reveal(path: string) {
    const idx = files.value.findIndex((f) => f.path === path);
    explorer.clearSelection();
    explorer.selectedFiles.add(path);
    if (idx >= 0) {
      const row = isListMode.value ? idx : Math.floor(idx / itemsPerRow.value);
      virtualizer.value.scrollToIndex(row, { align: 'center' });
    }
  }

  return {
    files,
    explorer,
    fileClipboard,
    contentRef,
    hoveredFolderPath,
    extraSmallIcon,
    isListMode,
    isGridMode,
    itemsPerRow,
    getRowItems,
    virtualizer,
    GRID_ITEM_WIDTHS,
    GRID_GAPS,
    bandSelect,
    onItemClick,
    onContentDragOver,
    onContentDragLeave,
    onContentDrop,
    onBandMouseDown,
    reveal
  };
}
