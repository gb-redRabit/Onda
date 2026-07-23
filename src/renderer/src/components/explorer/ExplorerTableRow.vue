<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { HardDrive, FolderOpen } from '@lucide/vue';
import { formatFileSize } from '@renderer/utils/formatters';
import type { FileItem } from '@renderer/types/explorer';
import { thumbTasks, thumbCache, iconCache, processThumbQueue, thumbTaskDone } from '@renderer/utils/thumbLoader';

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

const systemIcon = ref<string | null>(null);
const mediaThumb = ref<string | null>(null);
const visible = ref(false);
const rootEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
let thumbFired = false;

onMounted(() => {
  if (rootEl.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          visible.value = true;
          observer?.disconnect();
        }
      },
      { rootMargin: '400px' }
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

function loadThumbnail(path: string) {
  const cached = thumbCache.get(path);
  if (cached) {
    mediaThumb.value = cached;
    return;
  }
  thumbTasks.push(() => {
    window.api?.invoke('media:getThumbnail', path, 96).then((dataUrl) => {
      if (dataUrl) {
        thumbCache.set(path, dataUrl as string);
        mediaThumb.value = dataUrl as string;
      } else {
        const cachedIcon = iconCache.get(path);
        if (cachedIcon) { systemIcon.value = cachedIcon; }
        else {
          window.api?.invoke('shell:getFileIcon', path).then((icon) => {
            if (icon) { iconCache.set(path, icon as string); systemIcon.value = icon as string; }
          }).catch(() => {});
        }
      }
    }).catch(() => {
      const cachedIcon = iconCache.get(path);
      if (cachedIcon) { systemIcon.value = cachedIcon; }
      else {
        window.api?.invoke('shell:getFileIcon', path).then((icon) => {
          if (icon) { iconCache.set(path, icon as string); systemIcon.value = icon as string; }
        }).catch(() => {});
      }
    })
    .finally(() => { thumbTaskDone(); });
  });
  processThumbQueue();
}

watch(visible, (isVisible) => {
  if (!isVisible || props.isAtDrives || props.item.isDirectory) return;
  if (thumbFired) return;
  thumbFired = true;
  loadThumbnail(props.item.path);
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
  >asdsd
    <div class="flex items-center gap-2 min-w-0">
      <img v-if="mediaThumb && !isAtDrives && !item.isDirectory" :src="mediaThumb" class="w-4 h-4 object-contain shrink-0" />
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
