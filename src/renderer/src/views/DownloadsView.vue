<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useOnlineStore } from '@renderer/stores/online';
import { usePlayerStore } from '@renderer/stores/player';
import { useViewSearch } from '@renderer/composables/useViewSearch';
import {
  useDownloadsContextMenu,
  type DownloadCtx
} from '@renderer/composables/useDownloadsContextMenu';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import {
  buildDownloadFilters,
  groupDownloads,
  visibleDownloads
} from '@renderer/utils/downloadsView';
import DownloadMetaDialog from '@renderer/components/downloads/DownloadMetaDialog.vue';
import DownloadRowActions from '@renderer/components/downloads/DownloadRowActions.vue';
import DownloadFiltersBar from '@renderer/components/downloads/DownloadFiltersBar.vue';
import DownloadToolbar from '@renderer/components/downloads/DownloadToolbar.vue';
import type { DownloadTask } from '@renderer/types/online';
import type { MediaFile } from '@renderer/types/media';
import {
  Download,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  Copy,
  Pause,
  LogIn,
  RefreshCw
} from '@lucide/vue';

const yt = useOnlineStore();
const router = useRouter();
const player = usePlayerStore();

const filter = ref<'all' | 'active' | 'completed' | 'failed'>('all');
const channelFilter = ref('');
const searchQuery = ref('');
useViewSearch(searchQuery);

const channels = computed(() => {
  const map = new Map<string, string>();
  for (const d of yt.downloads) {
    if (d.channelId && !map.has(d.channelId)) map.set(d.channelId, d.channelTitle || d.channelId);
  }
  return Array.from(map.entries());
});

function openLibrary(t: DownloadTask) {
  const tab = t.kind === 'video' ? 'video' : 'tracks';
  localStorage.setItem('onda.libraryTab', tab);
  void router.push({ name: 'library', query: { tab } });
}

function playDownload(t: DownloadTask) {
  if (!t.outputPath) return;
  // The media server serves files from granted roots only — a download outside
  // the library (e.g. default Downloads) must be granted before playback.
  void window.api?.grantMediaAccess(t.outputPath);
  const ext = t.outputPath.slice(t.outputPath.lastIndexOf('.')).toLowerCase();
  const file: MediaFile = {
    id: `dl-${t.id}`,
    name: t.title,
    path: t.outputPath,
    extension: ext.replace(/^\./, ''),
    mimeType: '',
    size: 0,
    type: t.kind === 'video' ? 'video' : 'audio',
    addedAt: t.startedAt,
    playCount: 0
  };
  player.setTrack(file);
  player.play();
}

function login() {
  void window.api?.invoke('yt:login');
}

const metaTarget = ref<DownloadTask | null>(null);
const metaArtist = ref('');
const metaAlbum = ref('');
const metaYear = ref('');

function openMetaEditor(t: DownloadTask) {
  metaTarget.value = t;
  metaArtist.value = t.metaOverride?.artist || '';
  metaAlbum.value = t.metaOverride?.album || '';
  metaYear.value = t.metaOverride?.year || '';
}

function closeMetaEditor() {
  metaTarget.value = null;
}

async function saveMeta() {
  if (!metaTarget.value?.outputPath) return;
  const meta: { artist?: string; album?: string; year?: string } = {};
  if (metaArtist.value.trim()) meta.artist = metaArtist.value.trim();
  if (metaAlbum.value.trim()) meta.album = metaAlbum.value.trim();
  if (metaYear.value.trim()) meta.year = metaYear.value.trim();
  if (Object.keys(meta).length) {
    await yt.updateMetadata(metaTarget.value.outputPath, meta);
  }
  closeMetaEditor();
}

function copyPath(path?: string) {
  if (path) void window.api?.invoke('fs:copyPath', path);
}

function copyText(text: string) {
  void window.api?.invoke('fs:copyPath', text);
}

function openFolder(path?: string) {
  if (path) void window.api?.invoke('shell:showItemInFolder', path);
}

const { openMenu } = useDownloadsContextMenu();

function downloadCtx(t: DownloadTask): DownloadCtx {
  return {
    task: t,
    onPlay: playDownload,
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

const grouped = computed(() => groupDownloads(yt.downloads));
const active = computed(() => grouped.value.active);
const done = computed(() => grouped.value.completed);
const failed = computed(() => grouped.value.failed);
const pausedCount = computed(() => grouped.value.pausedCount);

const visible = computed(() =>
  visibleDownloads(
    yt.downloads,
    grouped.value,
    filter.value,
    channelFilter.value,
    searchQuery.value
  )
);

const filters = computed(() => buildDownloadFilters(yt.downloads, grouped.value));

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
  <div class="flex flex-col h-full">
    <DownloadToolbar
      :active-count="active.length"
      :paused-count="pausedCount"
      :has-finished="done.length > 0 || failed.length > 0"
    />

    <DownloadFiltersBar
      v-model:filter="filter"
      v-model:channel-filter="channelFilter"
      :filters="filters"
      :channels="channels"
    />

    <div class="flex-1 overflow-auto p-4">
      <div v-if="visible.length" class="space-y-2">
        <div
          v-for="t in visible"
          :key="t.id"
          class="p-3 rounded-box bg-base-100 border border-base-300 group/row"
          @contextmenu="openMenu($event, downloadCtx(t))"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-20 aspect-video rounded-field bg-base-200/(--glass-alpha) overflow-hidden shrink-0"
            >
              <img
                v-if="t.thumbnail"
                :src="t.thumbnail"
                :alt="t.title"
                loading="lazy"
                class="w-full h-full object-cover"
              />
              <component
                :is="icons[t.status] || Clock"
                v-else
                :size="20"
                class="w-full h-full p-3"
                :class="colors[t.status] || 'text-warning'"
              />
            </div>

            <div class="flex-1 min-w-0">
              <span class="text-sm flex-1 truncate block">{{ t.title }}</span>
              <span
                v-if="t.error"
                class="text-xs text-base-content/50 line-clamp-1 block"
                :title="t.error"
              >
                {{ errorCodeKey(t.errorCode) ? $t(errorCodeKey(t.errorCode)) : t.error }}
              </span>
              <span
                v-else-if="t.outputPath"
                class="text-xs text-base-content/50 truncate block"
                :title="t.outputPath"
              >
                {{ t.outputPath }}
              </span>
              <span
                v-if="t.fileHash"
                class="text-[10px] text-base-content/50 font-mono flex items-center gap-1"
                :title="t.fileHash"
              >
                <span class="truncate">sha256: {{ t.fileHash.slice(0, 16) }}…</span>
                <button
                  class="fx-noise p-0.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors shrink-0"
                  :title="$t('downloads.copyHash')"
                  @click="copyText(t.fileHash)"
                >
                  <Copy :size="10" />
                </button>
              </span>
              <span
                v-if="t.status === 'downloading'"
                class="text-xs text-base-content/50 font-mono"
              >
                {{ t.speed }} · {{ t.eta }}
              </span>
            </div>

            <button
              v-if="t.status === 'error' && t.errorCode === 'auth-required'"
              class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary hover:text-primary-content transition-colors shrink-0"
              :title="$t('downloads.loginTitle')"
              @click="login"
            >
              <LogIn :size="11" />
              {{ $t('downloads.login') }}
            </button>

            <span
              v-if="coverStatusKey(t)"
              class="text-[11px] shrink-0 flex items-center gap-1"
              :class="coverStatusClass(t)"
            >
              <RefreshCw v-if="t.coverStatus === 'fetching'" :size="10" class="animate-spin" />
              {{ $t(coverStatusKey(t)) }}
            </span>
            <span v-if="subtitleStatusKey(t)" class="text-[11px] text-base-content/50 shrink-0">
              {{ $t(subtitleStatusKey(t)) }}
            </span>
            <span class="text-xs text-base-content/50 shrink-0 uppercase">{{ t.format }}</span>

            <DownloadRowActions
              :task="t"
              @play="playDownload(t)"
              @copy-path="copyPath(t.outputPath)"
              @open-folder="openFolder(t.outputPath)"
              @edit-meta="openMetaEditor(t)"
              @open-library="openLibrary(t)"
            />
          </div>

          <div
            v-if="t.status === 'downloading' || t.status === 'pending'"
            class="w-full h-1.5 bg-base-300 rounded-full overflow-hidden mt-2"
          >
            <div class="h-full bg-primary rounded-full" :style="{ width: t.progress + '%' }" />
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center py-16 text-base-content/50">
        <Download :size="48" class="mb-3 opacity-30" />
        <p class="text-sm">{{ $t('downloads.empty') }}</p>
      </div>
    </div>

    <DownloadMetaDialog
      v-model:artist="metaArtist"
      v-model:album="metaAlbum"
      v-model:year="metaYear"
      :open="!!metaTarget"
      @close="closeMetaEditor"
      @save="saveMeta"
    />
  </div>
</template>
