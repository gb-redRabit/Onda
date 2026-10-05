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
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import type { DownloadTask } from '@renderer/types/online';

const props = defineProps<{ task: DownloadTask }>();
const emit = defineEmits<{
  play: [];
  copyPath: [];
  openFolder: [];
  editMeta: [];
  openLibrary: [];
}>();

const yt = useOnlineStore();
const { t } = useI18n();
const prompt = usePromptDialog();

// Anulowanie zadania wymaga potwierdzenia: dla pobieranych/wstrzymanych traci
// częściowe dane, a dla oczekujących usuwa je z kolejki. Spójne z pozostałymi
// akcjami destrukcyjnymi w aplikacji.
async function onCancel(): Promise<void> {
  const ok = await prompt.showConfirm(t('downloads.cancelConfirm', { name: props.task.title }));
  if (!ok) return;
  yt.cancelDownload(props.task.id);
}
</script>

<template>
  <div class="flex items-center gap-1 shrink-0">
    <button
      v-if="task.status === 'completed' && task.outputPath"
      data-testid="download-action-play"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
      :title="t('downloads.play')"
      :aria-label="t('downloads.play')"
      @click="emit('play')"
    >
      <Play :size="14" />
    </button>
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.copyPath')"
      :aria-label="t('downloads.copyPath')"
      @click="emit('copyPath')"
    >
      <Copy :size="14" />
    </button>
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.openFolder')"
      :aria-label="t('downloads.openFolder')"
      @click="emit('openFolder')"
    >
      <FolderOpen :size="14" />
    </button>
    <button
      v-if="task.status === 'completed' && task.outputPath"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.editMetadata')"
      :aria-label="t('downloads.editMetadata')"
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
      data-testid="download-action-pause"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.pause')"
      :aria-label="t('downloads.pause')"
      @click="yt.pauseDownload(task.id)"
    >
      <Pause :size="14" />
    </button>
    <button
      v-if="task.status === 'paused'"
      data-testid="download-action-resume"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
      :title="t('downloads.resume')"
      :aria-label="t('downloads.resume')"
      @click="yt.resumeDownload(task.id)"
    >
      <Play :size="14" />
    </button>
    <button
      v-if="task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
      :title="t('downloads.moveToFront')"
      :aria-label="t('downloads.moveToFront')"
      @click="yt.moveToFront(task.id)"
    >
      <ArrowUpToLine :size="14" />
    </button>
    <button
      v-if="task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.moveUp')"
      :aria-label="t('downloads.moveUp')"
      @click="yt.move(task.id, -1)"
    >
      <ArrowUp :size="14" />
    </button>
    <button
      v-if="task.status === 'pending'"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.moveDown')"
      :aria-label="t('downloads.moveDown')"
      @click="yt.move(task.id, 1)"
    >
      <ArrowDown :size="14" />
    </button>
    <button
      v-if="task.status === 'downloading' || task.status === 'pending'"
      data-testid="download-action-cancel"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-error hover:bg-base-content/10 transition-colors"
      :title="t('downloads.cancel')"
      :aria-label="t('downloads.cancel')"
      @click="onCancel"
    >
      <X :size="14" />
    </button>
    <button
      v-if="task.status === 'paused'"
      data-testid="download-action-cancel"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-error hover:bg-base-content/10 transition-colors"
      :title="t('downloads.cancel')"
      :aria-label="t('downloads.cancel')"
      @click="onCancel"
    >
      <X :size="14" />
    </button>
    <button
      v-if="task.status === 'error' || task.status === 'cancelled'"
      data-testid="download-action-retry"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      :title="t('downloads.retry')"
      :aria-label="t('downloads.retry')"
      @click="yt.retryDownload(task)"
    >
      <RotateCcw :size="14" />
    </button>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm()"
      @cancel="prompt.promptCancel()"
    />
  </div>
</template>
