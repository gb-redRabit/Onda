<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  FolderOpen,
  Library,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  X
} from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import type { DownloadTask } from '@renderer/types/online';

defineProps<{ task: DownloadTask }>();
const emit = defineEmits<{
  play: [];
  copyPath: [];
  openFolder: [];
  editMeta: [];
  openLibrary: [];
}>();

const yt = useOnlineStore();
const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-1 shrink-0">
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
      :title="t('downloads.play')"
      @click="emit('play')"
    >
      <Play :size="14" />
    </button>
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.copyPath')"
      @click="emit('copyPath')"
    >
      <Copy :size="14" />
    </button>
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.openFolder')"
      @click="emit('openFolder')"
    >
      <FolderOpen :size="14" />
    </button>
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.editMetadata')"
      @click="emit('editMeta')"
    >
      <Pencil :size="14" />
    </button>
    <button
      v-if="task.inLibrary"
      class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary hover:text-primary-content transition-colors shrink-0"
      :title="t('downloads.inLibraryTitle')"
      @click="emit('openLibrary')"
    >
      <Library :size="11" />
      {{ t('downloads.inLibrary') }}
    </button>
    <button
      v-if="task.status === 'downloading'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.pause')"
      @click="yt.pauseDownload(task.id)"
    >
      <Pause :size="14" />
    </button>
    <button
      v-if="task.status === 'paused'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
      :title="t('downloads.resume')"
      @click="yt.resumeDownload(task.id)"
    >
      <Play :size="14" />
    </button>
    <button
      v-if="task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
      :title="t('downloads.moveToFront')"
      @click="yt.moveToFront(task.id)"
    >
      <ArrowUpToLine :size="14" />
    </button>
    <button
      v-if="task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.moveUp')"
      @click="yt.move(task.id, -1)"
    >
      <ArrowUp :size="14" />
    </button>
    <button
      v-if="task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.moveDown')"
      @click="yt.move(task.id, 1)"
    >
      <ArrowDown :size="14" />
    </button>
    <button
      v-if="task.status === 'downloading' || task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-error hover:bg-base-content/10 transition-colors"
      :title="t('downloads.cancel')"
      @click="yt.cancelDownload(task.id)"
    >
      <X :size="14" />
    </button>
    <button
      v-if="task.status === 'paused'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-error hover:bg-base-content/10 transition-colors"
      :title="t('downloads.cancel')"
      @click="yt.cancelDownload(task.id)"
    >
      <X :size="14" />
    </button>
    <button
      v-if="task.status === 'error' || task.status === 'cancelled'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.retry')"
      @click="yt.retryDownload(task)"
    >
      <RotateCcw :size="14" />
    </button>
  </div>
</template>
