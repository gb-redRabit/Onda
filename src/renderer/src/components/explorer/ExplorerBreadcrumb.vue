<script setup lang="ts">
import { ref, inject } from 'vue';
import { ChevronLeft, ChevronRight, ChevronUp, Home } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';

const explorer = useExplorerStore();
const settings = useSettingsStore();
const { t } = useI18n();
const showConfirm = inject<(msg: string) => Promise<boolean>>('showConfirm', async (msg: string) =>
  confirm(msg)
);

const dropTargetIdx = ref(-2);
const dragEnterCount = ref(0);

function segmentPath(idx: number): string {
  if (idx < 0) return '';
  const parts = explorer.currentPath.split('\\').filter(Boolean);
  return parts.slice(0, idx + 1).join('\\');
}

function onDragOver(e: DragEvent, idx: number) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
  dropTargetIdx.value = idx;
}

function onDragEnter(_e: DragEvent, idx: number) {
  dragEnterCount.value++;
  dropTargetIdx.value = idx;
}

function onDragLeave(_e: DragEvent) {
  dragEnterCount.value--;
  if (dragEnterCount.value <= 0) {
    dragEnterCount.value = 0;
    dropTargetIdx.value = -2;
  }
}

async function onDrop(e: DragEvent, targetPath: string) {
  e.preventDefault();
  dropTargetIdx.value = -2;
  dragEnterCount.value = 0;
  const raw = e.dataTransfer?.getData('text/plain') || '';
  const paths = raw.split('\n').filter(Boolean);
  if (paths.length === 0) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (settings.explorer.confirmBeforeMove) {
    const key = ctrl ? 'explorer.copyConfirm' : 'explorer.moveConfirm';
    const ok = await showConfirm(
      t(key, { n: paths.length, dir: targetPath.split('\\').pop() || targetPath })
    );
    if (!ok) return;
  }
  const method = ctrl ? 'fs:copy' : 'fs:move';
  await window.api?.invoke(method, paths, targetPath);
  explorer.loadFiles(explorer.currentPath);
  window.api?.send('explorer:refreshAll');
}
</script>

<template>
  <div class="flex gap-0.5">
    <button
      class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors"
      :disabled="!explorer.canGoBack"
      @click="explorer.goBack"
    >
      <ChevronLeft :size="16" class="pointer-events-none" />
    </button>
    <button
      class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors"
      :disabled="!explorer.canGoForward"
      @click="explorer.goForward"
    >
      <ChevronRight :size="16" class="pointer-events-none" />
    </button>
    <button
      class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors"
      :disabled="!explorer.canGoUp"
      @click="explorer.goUp"
    >
      <ChevronUp :size="16" class="pointer-events-none" />
    </button>
  </div>
  <div
    class="flex-1 flex items-center gap-0.5 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs overflow-hidden"
    @dragover.prevent
    @drop.prevent
  >
    <button
      class="shrink-0 p-0.5 text-fg-faint hover:text-fg-base transition-colors"
      :class="{ 'ring-2 ring-accent-base bg-accent-ghost/50 rounded': dropTargetIdx === -1 }"
      @click="explorer.navigateTo('')"
      @dragover="onDragOver($event, -1)"
      @dragenter="onDragEnter($event, -1)"
      @dragleave="onDragLeave"
      @drop="onDrop($event, '')"
    >
      <Home :size="12" class="pointer-events-none" />
    </button>
    <template v-if="explorer.currentPath">
      <template v-for="(part, idx) in explorer.currentPath.split('\\').filter(Boolean)" :key="idx">
        <span v-if="idx > 0" class="text-fg-faint">\</span>
        <button
          class="px-1 py-0.5 rounded hover:bg-bg-hover text-fg-muted hover:text-fg-base transition-colors truncate max-w-30"
          :class="{ 'ring-2 ring-accent-base bg-accent-ghost/50': dropTargetIdx === idx }"
          @click="explorer.navigateTo(segmentPath(idx))"
          @dragover="onDragOver($event, idx)"
          @dragenter="onDragEnter($event, idx)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, segmentPath(idx))"
        >
          {{ part }}
        </button>
      </template>
    </template>
    <span v-else class="text-fg-faint px-1">{{ $t('explorer.thisComputer') }}</span>
  </div>
</template>
