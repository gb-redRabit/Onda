<script setup lang="ts">
import { computed } from 'vue';
import { HardDrive, FolderOpen, Image, Film, Music2 } from '@lucide/vue';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import { formatFileSize } from '@renderer/utils/formatters';
import type { FileItem } from '@renderer/types/explorer';
import { useThumbnail } from '@renderer/composables/useThumbnail';

const props = defineProps<{
  item: FileItem;
  isSelected: boolean;
  isAtDrives: boolean;
  isLibraryFolder?: boolean;
  viewMode?: string;
}>();

const emit = defineEmits<{
  (e: 'select', path: string, event: MouseEvent): void;
  (e: 'doubleClick', item: FileItem): void;
  (e: 'contextMenu', event: MouseEvent, item: FileItem): void;
}>();

const { rootEl, systemIcon, mediaThumb } = useThumbnail(props.item.path, props.item.isDirectory, props.isAtDrives, 320);
if (import.meta.env.DEV) { void rootEl; }

const fileTypeIcon = computed(() => {
  const cat = getFileTypeInfo(props.item.extension || '').category;
  if (cat === 'video') return Film;
  if (cat === 'audio') return Music2;
  return Image;
});

const size = computed(() => {
  switch (props.viewMode) {
    case 'small': return { icon: 36, pad: 6, fs: 'text-[10px]', mb: 1 };
    case 'medium': return { icon: 48, pad: 10, fs: 'text-[11px]', mb: 1.5 };
    case 'large': return { icon: 64, pad: 14, fs: 'text-[12px]', mb: 2 };
    case 'extraLarge': return { icon: 80, pad: 18, fs: 'text-[13px]', mb: 2.5 };
    default: return { icon: 48, pad: 10, fs: 'text-[11px]', mb: 1.5 };
  }
});
</script>

<template>
  <button
    ref="rootEl"
    class="flex flex-col items-center rounded-xl hover:bg-bg-hover transition-colors text-center group relative w-full"
    :class="{
      'bg-accent-ghost ring-1 ring-accent-base': isSelected,
      'bg-accent-ghost/15 ring-1 ring-accent-base/30': isLibraryFolder && !isSelected
    }"
    :style="{ padding: `${size.pad}px` }"
    @click="(e: MouseEvent) => emit('select', item.path, e)"
    @dblclick="emit('doubleClick', item)"
    @contextmenu.stop.prevent="emit('contextMenu', $event, item)"
  >
    <div
      class="rounded-lg flex items-center justify-center overflow-hidden shrink-0"
      :class="isAtDrives ? 'bg-accent-ghost' : isLibraryFolder ? 'bg-accent-ghost/30' : 'bg-bg-overlay'"
      :style="{ width: `${size.icon}px`, height: `${size.icon}px`, marginBottom: `${size.mb * 4}px` }"
    >
      <HardDrive v-if="isAtDrives" :size="Math.round(size.icon * 0.55)" class="text-accent-base" />
      <FolderOpen v-else-if="item.isDirectory" :size="Math.round(size.icon * 0.55)" class="text-accent-base" />
      <img
        v-else-if="mediaThumb"
        :src="mediaThumb"
        class="w-full h-full object-cover"
      />
      <img
        v-else-if="systemIcon"
        :src="systemIcon"
        :style="{ width: `${Math.round(size.icon * 0.5)}px`, height: `${Math.round(size.icon * 0.5)}px` }"
        class="object-contain"
      />
      <component :is="fileTypeIcon" v-else :size="Math.round(size.icon * 0.45)" :style="{ color: getFileTypeInfo(item.extension || '').color }" />
    </div>
    <span :class="`truncate w-full leading-tight font-medium ${size.fs}`">{{ item.name }}</span>
    <span v-if="isAtDrives && item.size > 0" :class="`text-[10px] text-fg-faint ${size.fs}`">{{
      formatFileSize(item.size)
    }}</span>
    <span v-if="isLibraryFolder && !isAtDrives" class="absolute top-1 right-1 px-1 py-0.5 text-[8px] rounded-md bg-accent-base/20 text-accent-base font-bold border border-accent-base/40 leading-none">LIB</span>
  </button>
</template>
