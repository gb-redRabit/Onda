<script setup lang="ts">
import { computed } from 'vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { HardDrive, FolderOpen, Music } from '@lucide/vue';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import { fileTypeIcon as categoryIcon } from '@renderer/utils/fileTypeIcons';
import { formatFileSize } from '@renderer/utils/formatters';
import { beginFileDrag } from '@renderer/utils/fileDrag';
import type { FileItem } from '@renderer/types/explorer';
import { useThumbnail } from '@renderer/composables/useThumbnail';

const props = defineProps<{
  item: FileItem;
  isSelected: boolean;
  isDriveList: boolean;
  isLibraryFolder?: boolean;
  viewMode?: string;
  hoveredFolderPath?: string | null;
  isCut?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', path: string, event: MouseEvent): void;
  (e: 'doubleClick', item: FileItem): void;
  (e: 'contextMenu', event: MouseEvent, item: FileItem): void;
}>();

const { rootEl, systemIcon, mediaThumb } = useThumbnail(
  props.item.path,
  props.item.isDirectory,
  props.isDriveList,
  320
);
if (import.meta.env.DEV) {
  void rootEl;
}

const typeIcon = computed(() => categoryIcon(props.item.extension));
const audioFile = computed(
  () => !props.item.isDirectory && getFileTypeInfo(props.item.extension || '').category === 'audio'
);

const size = computed(() => {
  switch (props.viewMode) {
    case 'small':
      return { icon: 36, pad: 6, fs: 'text-2xs', mb: 1 };
    case 'medium':
      return { icon: 48, pad: 10, fs: 'text-2xs', mb: 1.5 };
    case 'large':
      return { icon: 64, pad: 14, fs: 'text-[12px]', mb: 2 };
    case 'extraLarge':
      return { icon: 80, pad: 18, fs: 'text-[13px]', mb: 2.5 };
    default:
      return { icon: 48, pad: 10, fs: 'text-2xs', mb: 1.5 };
  }
});
</script>

<template>
  <button
    ref="rootEl"
    :draggable="!isDriveList"
    :data-file-path="item.path"
    :data-testid="`explorer-item-${item.name}`"
    :data-folder-path="item.isDirectory ? item.path : undefined"
    class="flex flex-col items-center fx-depth rounded-box fx-noise hover:bg-base-content/10 transition-colors text-center group relative w-full"
    :class="{
      'bg-primary/12 ring-2 ring-primary':
        isSelected || (hoveredFolderPath && item.isDirectory && hoveredFolderPath === item.path),
      'opacity-40': isCut
    }"
    :style="{ padding: `${size.pad}px` }"
    @click="(e: MouseEvent) => emit('select', item.path, e)"
    @dblclick="emit('doubleClick', item)"
    @contextmenu.stop.prevent="emit('contextMenu', $event, item)"
    @dragstart="
      (e: DragEvent) => {
        const store = useExplorerStore();
        if (store.selectedFiles.has(props.item.path)) {
          beginFileDrag(e, [...store.selectedFiles]);
        } else {
          beginFileDrag(e, [props.item.path]);
        }
      }
    "
  >
    <div
      class="relative rounded-field flex items-center justify-center overflow-hidden shrink-0"
      :class="isDriveList || isLibraryFolder ? 'bg-primary/10' : 'bg-base-200/70'"
      :style="{
        width: `${size.icon}px`,
        height: `${size.icon}px`,
        marginBottom: `${size.mb * 4}px`
      }"
    >
      <HardDrive
        v-if="isDriveList"
        :size="Math.round(size.icon * 0.55)"
        class="text-primary-text"
      />
      <FolderOpen
        v-else-if="item.isDirectory"
        :size="Math.round(size.icon * 0.55)"
        class="text-primary-text"
      />
      <img v-else-if="mediaThumb" alt="" :src="mediaThumb" class="w-full h-full object-cover" />
      <Music
        v-else-if="audioFile && !systemIcon"
        :size="Math.round(size.icon * 0.45)"
        class="text-primary-text/70"
      />
      <img
        v-else-if="systemIcon"
        alt=""
        :src="systemIcon"
        :style="{
          width: `${Math.round(size.icon * 0.5)}px`,
          height: `${Math.round(size.icon * 0.5)}px`
        }"
        class="object-contain"
      />
      <component
        :is="typeIcon"
        v-else
        :size="Math.round(size.icon * 0.45)"
        :style="{ color: getFileTypeInfo(item.extension || '').color }"
      />
      <span
        v-if="!isDriveList && !item.isDirectory && item.extension"
        class="absolute bottom-0.5 right-0.5 rounded-field bg-neutral/80 px-1 py-0.5 text-[8px] font-semibold uppercase leading-none text-neutral-content"
        >{{ item.extension }}</span
      >
    </div>
    <span :class="`line-clamp-2 w-full leading-tight font-medium ${size.fs}`" :title="item.name">{{
      item.name
    }}</span>
    <span v-if="isDriveList && item.size > 0" :class="`text-2xs text-base-content/50 ${size.fs}`">{{
      formatFileSize(item.size)
    }}</span>
    <span
      v-if="isLibraryFolder && !isDriveList"
      class="absolute top-1 right-1 px-1 py-0.5 text-[8px] rounded-field bg-primary/20 text-primary-text font-bold border border-primary/40 leading-none"
      >LIB</span
    >
  </button>
</template>
