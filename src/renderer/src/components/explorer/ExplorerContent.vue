<script setup lang="ts">
import { inject, ref } from 'vue';
import { ChevronUp, ChevronDown, HardDrive, FolderOpen } from '@lucide/vue';
import { isLibraryFolder } from '@renderer/utils/libraryFolders';
import { beginFileDrag } from '@renderer/utils/fileDrag';
import { useExplorerContent } from '@renderer/composables/useExplorerContent';
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

const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async () => true);

const scrollRef = ref<HTMLDivElement | null>(null);

function setScrollRef(el: unknown) {
  scrollRef.value = el as HTMLDivElement | null;
  contentRef.value = el as HTMLElement | null;
}

const {
  files,
  explorer,
  fileClipboard,
  contentRef,
  hoveredFolderPath,
  extraSmallIcon,
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
} = useExplorerContent(props, showConfirm, scrollRef);

defineExpose({ reveal });
</script>

<template>
  <div
    :ref="setScrollRef"
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

    <div v-if="explorer.isLoading && files.length === 0" class="flex justify-center py-8">
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
          <HardDrive v-else-if="explorer.isAtDrives" :size="12" class="text-accent-base shrink-0" />
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
            @select="
              (path: string, e: MouseEvent) =>
                onItemClick(e, path, virtualRow.index * itemsPerRow + i)
            "
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
