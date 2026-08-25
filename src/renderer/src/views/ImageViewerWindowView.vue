<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import ImageViewer from '@renderer/components/explorer/ImageViewer.vue';
import type { FileItem } from '@renderer/types/explorer';

const files = ref<FileItem[]>([]);
const initialIndex = ref(0);
const ready = ref(false);

let cleanupFiles: (() => void) | null = null;

onMounted(async () => {
  const data = (await window.api?.invoke('imageViewer:getData')) as
    | { files: FileItem[]; index: number }
    | undefined;
  if (data && Array.isArray(data.files)) {
    files.value = data.files;
    initialIndex.value = data.index;
  }
  ready.value = true;

  const cleanup = window.api?.on('imageViewer:files', (payload: unknown) => {
    if (payload && typeof payload === 'object' && 'files' in payload) {
      const p = payload as { files: FileItem[]; index: number };
      files.value = p.files;
      initialIndex.value = p.index;
      ready.value = true;
    }
  });
  if (cleanup) cleanupFiles = cleanup;
});

function close() {
  window.api?.invoke('imageViewer:close');
}

onUnmounted(() => {
  cleanupFiles?.();
});
</script>

<template>
  <ImageViewer
    v-if="ready"
    :files="files"
    :initial-index="initialIndex"
    @close="close"
  />
</template>
