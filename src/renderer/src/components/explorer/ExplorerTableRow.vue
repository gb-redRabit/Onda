<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { HardDrive, FolderOpen } from '@lucide/vue';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import { formatFileSize } from '@renderer/utils/formatters';
import { SUPPORTED_IMAGE_FORMATS } from '@renderer/utils/constants';
import type { FileItem } from '@renderer/types/explorer';

const props = defineProps<{
  item: FileItem;
  isSelected: boolean;
  isAtDrives: boolean;
  isLibraryFolder?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', path: string, event: MouseEvent): void;
  (e: 'doubleClick', item: FileItem): void;
  (e: 'contextMenu', event: MouseEvent, item: FileItem): void;
}>();

const IMAGE_EXTS = new Set(SUPPORTED_IMAGE_FORMATS);
const systemIcon = ref<string | null>(null);
const visible = ref(false);
const rootEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (rootEl.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          visible.value = true;
          observer?.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(rootEl.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});

function iconComponent() {
  if (props.isAtDrives) return HardDrive;
  if (props.item.isDirectory) return FolderOpen;
  return null;
}

watch(visible, (isVisible) => {
  if (!isVisible || props.isAtDrives || props.item.isDirectory) return;
  window.api?.invoke('shell:getFileIcon', props.item.path).then((icon) => {
    if (icon) systemIcon.value = icon as string;
  }).catch(() => {});
});

</script>

<template>
  <button
    ref="rootEl"
    class="w-full grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors text-left items-center text-sm group relative"
    :class="{
      'bg-accent-ghost ring-1 ring-accent-base': isSelected,
      'bg-accent-ghost/15 ring-1 ring-accent-base/30': isLibraryFolder && !isSelected
    }"
    @click="(e: MouseEvent) => emit('select', item.path, e)"
    @dblclick="emit('doubleClick', item)"
    @contextmenu.stop.prevent="emit('contextMenu', $event, item)"
  >
    <div class="flex items-center gap-2 min-w-0">
      <img v-if="systemIcon && !isAtDrives && !item.isDirectory" :src="systemIcon" class="w-4 h-4 object-contain shrink-0" />
      <component v-else :is="iconComponent()" :size="14" :class="isAtDrives || item.isDirectory ? 'text-accent-base shrink-0' : 'shrink-0'" :style="!isAtDrives && !item.isDirectory && !(item.extension && IMAGE_EXTS.has(item.extension)) ? { color: getFileTypeInfo(item.extension || '').color } : {}" />
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
