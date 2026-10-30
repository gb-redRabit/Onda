<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  LogIn,
  Pause,
  RefreshCw,
  RotateCcw,
  XCircle
} from '@lucide/vue';
import {
  useDownloadsContextMenu,
  type DownloadCtx
} from '@renderer/composables/useDownloadsContextMenu';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { useOnlineStore } from '@renderer/stores/online';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import Button from '@renderer/components/ui/Button.vue';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import type { DownloadTask } from '@renderer/types/online';
import DownloadRowActions from './DownloadRowActions.vue';

const props = defineProps<{ task: DownloadTask }>();
const emit = defineEmits<{ play: []; editMeta: []; openLibrary: []; retryCover: [] }>();

const { t } = useI18n();
const yt = useOnlineStore();
const prompt = usePromptDialog();
const { openMenu } = useDownloadsContextMenu();

// Anulowanie wymaga potwierdzenia: dla pobieranych/wstrzymanych traci częściowe
// dane, a dla oczekujących usuwa zadanie z kolejki. Jedno miejsce dla przycisku
// w wierszu i menu kontekstowego.
async function cancelWithConfirm(): Promise<void> {
  const ok = await prompt.showConfirm(t('downloads.cancelConfirm', { name: props.task.title }));
  if (!ok) return;
  yt.cancelDownload(props.task.id);
}

function openFolder(path?: string): void {
  if (path) void window.api?.invoke('shell:showItemInFolder', path);
}
function copyText(text?: string): void {
  if (text) void window.api?.invoke('fs:copyPath', text);
}
function login(): void {
  void window.api?.invoke('yt:login');
}

function downloadCtx(task: DownloadTask): DownloadCtx {
  return {
    task,
    onPlay: () => emit('play'),
    onOpenFolder: openFolder,
    onCopyText: copyText,
    onEditMeta: () => emit('editMeta'),
    onOpenLibrary: () => emit('openLibrary'),
    onCancel: cancelWithConfirm
  };
}

const icons = {
  downloading: Download,
  completed: CheckCircle,
  error: AlertCircle,
  cancelled: XCircle,
  pending: Clock,
  paused: Pause
} as const;
const colors = {
  downloading: 'text-primary-text',
  completed: 'text-success',
  error: 'text-error',
  cancelled: 'text-base-content/50',
  pending: 'text-warning',
  paused: 'text-warning'
} as const;

const isActive = computed(
  () => props.task.status === 'downloading' || props.task.status === 'pending'
);

const errorText = computed(() => {
  const key = errorCodeKey(props.task.errorCode);
  return key ? t(key) : props.task.error;
});

/**
 * Jedna linia kontekstu zamiast stosu etykiet: błąd, faza przygotowania,
 * postęp, a dla ukończonych — kanał. Statusy „cover embedded”/„napisy
 * zapisane” nie wymagają uwagi, więc nie zajmują miejsca w wierszu.
 */
const metaText = computed(() => {
  const task = props.task;
  if (task.error) return errorText.value;
  if (task.message) return t(task.message);
  switch (task.status) {
    case 'downloading':
      return [task.progress > 0 ? `${task.progress}%` : '', task.speed, task.eta]
        .filter(Boolean)
        .join(' · ');
    case 'pending':
      return t('downloads.statusPending');
    case 'paused':
      return t('downloads.statusPaused');
    case 'completed':
      return task.metaOverride?.artist || task.channelTitle || '';
    default:
      return '';
  }
});

const metaTitle = computed(() =>
  props.task.status === 'completed' ? props.task.outputPath : undefined
);
</script>

<template>
  <div
    data-testid="download-row"
    class="group/row rounded-box border border-base-300/70 bg-base-100/90 px-3 py-2 transition-colors hover:border-base-content/20"
    @contextmenu="openMenu($event, downloadCtx(task))"
  >
    <div class="flex items-center gap-3">
      <div
        class="shrink-0 overflow-hidden rounded-field bg-base-200/(--glass-alpha)"
        :class="task.kind === 'video' ? 'aspect-video w-20' : 'size-12'"
      >
        <img
          v-if="task.thumbnail"
          :src="task.thumbnail"
          :alt="task.title"
          loading="lazy"
          class="h-full w-full object-cover"
        />
        <component
          :is="icons[task.status] || Clock"
          v-else
          :size="18"
          class="h-full w-full p-2"
          :class="colors[task.status] || 'text-warning'"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm" :title="task.title">{{ task.title }}</span>
          <span
            class="shrink-0 rounded-full bg-base-content/6 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-base-content/45"
            >{{ task.format }}</span
          >
        </div>
        <p
          v-if="metaText"
          class="mt-0.5 truncate text-xs"
          :class="
            task.error
              ? 'text-error/80'
              : task.status === 'downloading'
                ? 'font-mono text-base-content/45'
                : 'text-base-content/50'
          "
          :title="metaTitle"
        >
          {{ metaText }}
        </p>
      </div>

      <RefreshCw
        v-if="task.coverStatus === 'fetching'"
        :size="12"
        class="shrink-0 animate-spin text-base-content/40"
        :title="t('downloads.coverStatusFetching')"
      />
      <Button
        v-else-if="task.coverStatus === 'error'"
        type="button"
        data-testid="download-retry-cover"
        variant="ghost"
        size="sm"
        :label="t('downloads.coverRetry')"
        :title="
          task.coverError
            ? `${task.coverError} — ${t('downloads.coverRetry')}`
            : t('downloads.coverRetry')
        "
        class="gap-1 px-1.5 text-[11px] text-warning"
        @click="emit('retryCover')"
      >
        <RotateCcw :size="10" />
        {{ t('downloads.coverStatusError') }}
      </Button>
      <Button
        v-if="task.status === 'error' && task.errorCode === 'auth-required'"
        type="button"
        variant="soft"
        size="sm"
        :title="t('downloads.loginTitle')"
        class="gap-1 text-[11px]"
        @click="login"
      >
        <LogIn :size="11" />
        {{ t('downloads.login') }}
      </Button>

      <DownloadRowActions
        :task="task"
        @play="emit('play')"
        @edit-meta="emit('editMeta')"
        @open-library="emit('openLibrary')"
        @cancel="cancelWithConfirm"
      />
    </div>

    <div
      v-if="isActive"
      class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-base-300"
      role="progressbar"
      :aria-label="t('downloads.title')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="task.progress"
    >
      <div class="h-full rounded-full bg-primary" :style="{ width: task.progress + '%' }" />
    </div>

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
