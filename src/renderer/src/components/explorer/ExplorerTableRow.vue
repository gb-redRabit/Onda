<script setup lang="ts">
import { useExplorerStore } from '@renderer/stores/explorer';
import { HardDrive, FolderOpen, Music2, Film, Image } from '@lucide/vue';
import { formatFileSize } from '@renderer/utils/formatters';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import { beginFileDrag } from '@renderer/utils/fileDrag';
import type { FileItem } from '@renderer/types/explorer';
import { useThumbnail } from '@renderer/composables/useThumbnail';

const props = defineProps<{
  item: FileItem;
  isSelected: boolean;
  isAtDrives: boolean;
  isLibraryFolder?: boolean;
  hoveredFolderPath?: string | null;
  isCut?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', path: string, event: MouseEvent): void;
  (e: 'doubleClick', item: FileItem): void;
  (e: 'contextMenu', event: MouseEvent, item: FileItem): void;
}>();

const { rootEl, systemIcon, mediaThumb } = useThumbnail(props.item.path, props.item.isDirectory, props.isAtDrives, 96);
if (import.meta.env.DEV) { void rootEl; }

function iconComponent() {
  if (props.isAtDrives) return HardDrive;
  if (props.item.isDirectory) return FolderOpen;
  const cat = getFileTypeInfo(props.item.extension || '').category;
  if (cat === 'video') return Film;
  if (cat === 'audio') return Music2;
  return Image;
}
</script>

<template>
  <button
    ref="rootEl"
    :draggable="!isAtDrives"
    :data-file-path="item.path"
    :data-folder-path="item.isDirectory ? item.path : undefined"
    class="w-full grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors text-left items-center text-sm group relative"
    :class="{
      'bg-accent-ghost ring-1 ring-accent-base': isSelected,
      'bg-accent-ghost/15 ring-1 ring-accent-base/30': isLibraryFolder && !isSelected,
      'ring-2 ring-accent-base bg-accent-ghost/50': hoveredFolderPath && item.isDirectory && hoveredFolderPath === item.path,
      'opacity-40': isCut
    }"
    @click="(e: MouseEvent) => emit('select', item.path, e)"
    @dblclick="emit('doubleClick', item)"
    @contextmenu.stop.prevent="emit('contextMenu', $event, item)"
    @dragstart="(e: DragEvent) => { const store = useExplorerStore(); if (store.selectedFiles.has(props.item.path)) { beginFileDrag(e, [...store.selectedFiles]); } else { beginFileDrag(e, [props.item.path]); } }"
  >
    <div class="flex items-center gap-2 min-w-0"><img v-if="mediaThumb && !isAtDrives && !item.isDirectory" :src="mediaThumb" class="w-4 h-4 object-contain shrink-0" />
      <img v-else-if="systemIcon && !isAtDrives && !item.isDirectory" :src="systemIcon" class="w-4 h-4 object-contain shrink-0" />
      <component v-else :is="iconComponent()" :size="14" :class="isAtDrives || item.isDirectory ? 'text-accent-base shrink-0' : 'shrink-0'" />
      <span class="truncate">{{ item.name }}</span>
      <span v-if="isLibraryFolder && !isAtDrives" class="shrink-0 text-[8px] px-1 py-0.5 rounded-md bg-accent-base/20 text-accent-base font-bold border border-accent-base/40 leading-none">LIB</span>
    </div>
    <span class="text-fg-faint text-xs font-mono">
      {{
        isAtDrives
          ? item.size > 0
            ? formatFileSize(item.size)
            : '—'
          : item.isDirectory
            ? '—'
            : formatFileSize(item.size)
      }}
    </span>
    <span class="text-fg-faint text-xs">{{
      item.extension || (isAtDrives ? $t('explorer.drive') : '—')
    }}</span>
    <span class="text-fg-faint text-xs text-right font-mono">{{
      new Date(item.modifiedAt).toLocaleDateString()
    }}</span>
  </button>
</template>
