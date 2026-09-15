<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Copy,
  Download,
  LogIn,
  Pause,
  RefreshCw,
  XCircle
} from '@lucide/vue';
import {
  useDownloadsContextMenu,
  type DownloadCtx
} from '@renderer/composables/useDownloadsContextMenu';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import type { DownloadTask } from '@renderer/types/online';
import DownloadRowActions from './DownloadRowActions.vue';

defineProps<{ task: DownloadTask }>();
const emit = defineEmits<{ play: []; editMeta: []; openLibrary: [] }>();

const { t } = useI18n();
const { openMenu } = useDownloadsContextMenu();

function openFolder(path?: string) {
  if (path) void window.api?.invoke('shell:showItemInFolder', path);
}
function copyText(text?: string) {
  if (text) void window.api?.invoke('fs:copyPath', text);
}
function login() {
  void window.api?.invoke('yt:login');
}

function downloadCtx(task: DownloadTask): DownloadCtx {
  return {
    task,
    onPlay: () => emit('play'),
    onOpenFolder: openFolder,
    onCopyText: copyText
  };
}

const coverStatusKey = (t: { coverStatus?: string }): string => {
  switch (t.coverStatus) {
    case 'fetching':
      return 'downloads.coverStatusFetching';
    case 'embedded':
      return 'downloads.coverStatusEmbedded';
    case 'saved':
      return 'downloads.coverStatusSaved';
    case 'error':
      return 'downloads.coverStatusError';
    default:
      return '';
  }
};

const subtitleStatusKey = (t: { subtitleStatus?: string }): string => {
  switch (t.subtitleStatus) {
    case 'embedded':
      return 'downloads.subtitleStatusEmbedded';
    case 'saved':
      return 'downloads.subtitleStatusSaved';
    case 'missing':
      return 'downloads.subtitleStatusMissing';
    default:
      return '';
  }
};

const coverStatusClass = (t: { coverStatus?: string }): string => {
  switch (t.coverStatus) {
    case 'fetching':
      return 'text-base-content/50';
    case 'embedded':
    case 'saved':
      return 'text-success';
    case 'error':
      return 'text-warning';
    default:
      return '';
  }
};

const icons = {
  downloading: Download,
  completed: CheckCircle,
  error: AlertCircle,
  cancelled: XCircle,
  pending: Clock,
  paused: Pause
} as const;
const colors = {
  downloading: 'text-primary',
  completed: 'text-success',
  error: 'text-error',
  cancelled: 'text-base-content/50',
  pending: 'text-warning',
  paused: 'text-warning'
} as const;
</script>

<template>
  <div
    data-testid="download-row"
    class="p-3 rounded-box bg-base-100 border border-base-300 group/row"
    @contextmenu="openMenu($event, downloadCtx(task))"
  >
    <div class="flex items-center gap-3">
      <div
        class="w-20 aspect-video rounded-field bg-base-200/(--glass-alpha) overflow-hidden shrink-0"
      >
        <img
          v-if="task.thumbnail"
          :src="task.thumbnail"
          :alt="task.title"
          loading="lazy"
          class="w-full h-full object-cover"
        />
        <component
          :is="icons[task.status] || Clock"
          v-else
          :size="20"
          class="w-full h-full p-3"
          :class="colors[task.status] || 'text-warning'"
        />
      </div>

      <div class="flex-1 min-w-0">
        <span class="text-sm flex-1 truncate block">{{ task.title }}</span>
        <span
          v-if="task.error"
          class="text-xs text-base-content/50 line-clamp-1 block"
          :title="task.error"
        >
          {{ errorCodeKey(task.errorCode) ? t(errorCodeKey(task.errorCode)) : task.error }}
        </span>
        <span
          v-else-if="task.outputPath"
          class="text-xs text-base-content/50 truncate block"
          :title="task.outputPath"
        >
          {{ task.outputPath }}
        </span>
        <span
          v-if="task.fileHash"
          class="text-[10px] text-base-content/50 font-mono flex items-center gap-1"
          :title="task.fileHash"
        >
          <span class="truncate">sha256: {{ task.fileHash.slice(0, 16) }}…</span>
          <button
            class="fx-noise p-0.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors shrink-0"
            :title="t('downloads.copyHash')"
            @click="copyText(task.fileHash)"
          >
            <Copy :size="10" />
          </button>
        </span>
        <span v-if="task.status === 'downloading'" class="text-xs text-base-content/50 font-mono">
          {{ task.speed }} · {{ task.eta }}
        </span>
      </div>

      <button
        v-if="task.status === 'error' && task.errorCode === 'auth-required'"
        class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary hover:text-primary-content transition-colors shrink-0"
        :title="t('downloads.loginTitle')"
        @click="login"
      >
        <LogIn :size="11" />
        {{ t('downloads.login') }}
      </button>

      <span
        v-if="coverStatusKey(task)"
        class="text-[11px] shrink-0 flex items-center gap-1"
        :class="coverStatusClass(task)"
      >
        <RefreshCw v-if="task.coverStatus === 'fetching'" :size="10" class="animate-spin" />
        {{ t(coverStatusKey(task)) }}
      </span>
      <span v-if="subtitleStatusKey(task)" class="text-[11px] text-base-content/50 shrink-0">
        {{ t(subtitleStatusKey(task)) }}
      </span>
      <span class="text-xs text-base-content/50 shrink-0 uppercase">{{ task.format }}</span>

      <DownloadRowActions
        :task="task"
        @play="emit('play')"
        @copy-path="copyText(task.outputPath)"
        @open-folder="openFolder(task.outputPath)"
        @edit-meta="emit('editMeta')"
        @open-library="emit('openLibrary')"
      />
    </div>

    <div
      v-if="task.status === 'downloading' || task.status === 'pending'"
      class="w-full h-1.5 bg-base-300 rounded-full overflow-hidden mt-2"
    >
      <div class="h-full bg-primary rounded-full" :style="{ width: task.progress + '%' }" />
    </div>
  </div>
</template>
