<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { HardDrive, FolderOpen, Music2, Film } from '@lucide/vue';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import { formatFileSize } from '@renderer/utils/formatters';
import { SUPPORTED_IMAGE_FORMATS } from '@renderer/utils/constants';
import type { FileItem } from '@renderer/types/explorer';

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

const IMAGE_EXTS = new Set(SUPPORTED_IMAGE_FORMATS);
const thumbError = ref(false);
const systemIcon = ref<string | null>(null);
const visible = ref(false);
const rootEl = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const size = computed(() => {
  switch (props.viewMode) {
    case 'small': return { icon: 36, pad: 6, fs: 'text-[10px]', mb: 1 };
    case 'medium': return { icon: 48, pad: 10, fs: 'text-[11px]', mb: 1.5 };
    case 'large': return { icon: 64, pad: 14, fs: 'text-[12px]', mb: 2 };
    case 'extraLarge': return { icon: 80, pad: 18, fs: 'text-[13px]', mb: 2.5 };
    default: return { icon: 48, pad: 10, fs: 'text-[11px]', mb: 1.5 };
  }
});

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

watch(visible, (isVisible) => {
  if (!isVisible) return;
  if (props.isAtDrives || props.item.isDirectory) return;
  if (hasThumbnail()) return;
  window.api?.invoke('shell:getFileIcon', props.item.path).then((icon) => {
    if (icon) systemIcon.value = icon as string;
  }).catch(() => {});
});

function thumbSrc(path: string): string {
  return `file:///${path.replace(/\\/g, '/')}`;
}

function hasThumbnail(): boolean {
  return !props.isAtDrives && !props.item.isDirectory && !!props.item.extension && IMAGE_EXTS.has(props.item.extension);
}
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
        v-else-if="hasThumbnail() && !thumbError"
        :src="thumbSrc(item.path)"
        class="w-full h-full object-cover"
        loading="lazy"
        @error="thumbError = true"
      />
      <img
        v-else-if="systemIcon && !thumbError"
        :src="systemIcon"
        :style="{ width: `${Math.round(size.icon * 0.5)}px`, height: `${Math.round(size.icon * 0.5)}px` }"
        class="object-contain"
      />
      <component
        :is="getFileTypeInfo(item.extension || '').category === 'video' ? Film : Music2"
        v-else
        :size="Math.round(size.icon * 0.45)"
        :style="{ color: getFileTypeInfo(item.extension || '').color }"
      />
    </div>
    <span :class="`truncate w-full leading-tight font-medium ${size.fs}`">{{ item.name }}</span>
    <span v-if="isAtDrives && item.size > 0" :class="`text-[10px] text-fg-faint ${size.fs}`">{{
      formatFileSize(item.size)
    }}</span>
    <span v-if="isLibraryFolder && !isAtDrives" class="absolute top-1 right-1 px-1 py-0.5 text-[8px] rounded-md bg-accent-base/20 text-accent-base font-bold border border-accent-base/40 leading-none">LIB</span>
  </button>
</template>
