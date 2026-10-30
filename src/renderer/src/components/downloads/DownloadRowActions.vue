<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FolderOpen, MoreHorizontal, Pause, Play, RotateCcw, X } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useDownloadsContextMenu } from '@renderer/composables/useDownloadsContextMenu';
import Button from '@renderer/components/ui/Button.vue';
import type { DownloadTask } from '@renderer/types/online';

const props = defineProps<{ task: DownloadTask }>();
const emit = defineEmits<{
  play: [];
  editMeta: [];
  openLibrary: [];
  cancel: [];
}>();

const yt = useOnlineStore();
const { t } = useI18n();
const { openMenuAt } = useDownloadsContextMenu();

const isActive = computed(() => ['pending', 'downloading', 'paused'].includes(props.task.status));

function openFolder(path?: string): void {
  if (path) void window.api?.invoke('shell:showItemInFolder', path);
}

function copyText(text?: string): void {
  if (text) void window.api?.invoke('fs:copyPath', text);
}

const ctx = computed(() => ({
  task: props.task,
  onPlay: () => emit('play'),
  onOpenFolder: openFolder,
  onCopyText: copyText,
  onEditMeta: () => emit('editMeta'),
  onOpenLibrary: () => emit('openLibrary'),
  onCancel: () => emit('cancel')
}));

function openActions(e: MouseEvent): void {
  openMenuAt(e.currentTarget as HTMLElement, ctx.value);
}
</script>

<template>
  <div class="flex items-center gap-0.5 shrink-0">
    <Button
      v-if="task.status === 'completed' && task.outputPath"
      data-testid="download-action-play"
      variant="ghost"
      size="icon"
      :label="t('downloads.play')"
      :title="t('downloads.play')"
      class="text-base-content/60 hover:text-primary-text"
      @click="emit('play')"
    >
      <Play :size="14" />
    </Button>
    <Button
      v-if="task.status === 'completed' && task.outputPath"
      data-testid="download-action-open-folder"
      variant="ghost"
      size="icon"
      :label="t('downloads.openFolder')"
      :title="t('downloads.openFolder')"
      @click="openFolder(task.outputPath)"
    >
      <FolderOpen :size="14" />
    </Button>
    <Button
      v-if="task.status === 'downloading'"
      data-testid="download-action-pause"
      variant="ghost"
      size="icon"
      :label="t('downloads.pause')"
      :title="t('downloads.pause')"
      @click="yt.pauseDownload(task.id)"
    >
      <Pause :size="14" />
    </Button>
    <Button
      v-if="task.status === 'paused'"
      data-testid="download-action-resume"
      variant="ghost"
      size="icon"
      :label="t('downloads.resume')"
      :title="t('downloads.resume')"
      class="text-primary-text"
      @click="yt.resumeDownload(task.id)"
    >
      <Play :size="14" />
    </Button>
    <Button
      v-if="task.status === 'error' || task.status === 'cancelled'"
      data-testid="download-action-retry"
      variant="ghost"
      size="icon"
      :label="t('downloads.retry')"
      :title="t('downloads.retry')"
      @click="yt.retryDownload(task)"
    >
      <RotateCcw :size="14" />
    </Button>
    <Button
      v-if="isActive"
      data-testid="download-action-cancel"
      variant="ghost"
      size="icon"
      :label="t('downloads.cancel')"
      :title="t('downloads.cancel')"
      class="hover:text-error"
      @click="emit('cancel')"
    >
      <X :size="14" />
    </Button>
    <Button
      data-testid="download-action-menu"
      variant="ghost"
      size="icon"
      :label="t('common.moreActions')"
      :title="t('common.moreActions')"
      aria-haspopup="menu"
      @click="openActions"
    >
      <MoreHorizontal :size="14" />
    </Button>
  </div>
</template>
