<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { usePlayerStore } from '@renderer/stores/player';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import type { DownloadTask } from '@renderer/types/youtube';
import type { MediaFile } from '@renderer/types/media';
import {
  Download,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  X,
  RotateCcw,
  Trash2,
  Library,
  FolderOpen,
  Copy,
  Pause,
  Play,
  LogIn,
  ArrowUpToLine,
  ArrowUp,
  ArrowDown,
  Upload,
  Pencil
} from '@lucide/vue';

const yt = useYouTubeStore();
const router = useRouter();
const player = usePlayerStore();

const filter = ref<'all' | 'active' | 'completed' | 'failed'>('all');
const channelFilter = ref('');

const channels = computed(() => {
  const map = new Map<string, string>();
  for (const d of yt.downloads) {
    if (d.channelId && !map.has(d.channelId)) map.set(d.channelId, d.channelTitle || d.channelId);
  }
  return Array.from(map.entries());
});

function openLibrary() {
  void router.push({ name: 'library' });
}

function playDownload(t: DownloadTask) {
  if (!t.outputPath) return;
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

const scheduleTime = ref('');
const scheduledAt = ref<number | null>(null);

async function applySchedule() {
  const m = scheduleTime.value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  await yt.scheduleStart(d.getTime());
  scheduledAt.value = d.getTime();
}

async function clearSchedule() {
  await yt.scheduleStart(null);
  scheduledAt.value = null;
  scheduleTime.value = '';
}

onMounted(async () => {
  scheduledAt.value = await yt.getScheduledStart();
});

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
      return 'text-fg-faint';
    case 'embedded':
    case 'saved':
      return 'text-green-base';
    case 'error':
      return 'text-amber-base';
    default:
      return '';
  }
};

const active = computed(() =>
  yt.downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'pending' || d.status === 'paused'
  )
);
const done = computed(() => yt.downloads.filter((d) => d.status === 'completed'));
const failed = computed(() =>
  yt.downloads.filter((d) => d.status === 'error' || d.status === 'cancelled')
);
const pausedCount = computed(
  () => yt.downloads.filter((d) => d.status === 'paused').length
);

const visible = computed(() => {
  let list: typeof yt.downloads;
  switch (filter.value) {
    case 'active':
      list = active.value;
      break;
    case 'completed':
      list = done.value;
      break;
    case 'failed':
      list = failed.value;
      break;
    default:
      list = yt.downloads;
  }
  if (channelFilter.value) {
    list = list.filter((d) => d.channelId === channelFilter.value);
  }
  return list;
});

const filters = computed<
  Array<{ id: 'all' | 'active' | 'completed' | 'failed'; labelKey: string; count: number }>
>(() => [
  { id: 'all', labelKey: 'downloads.filterAll', count: yt.downloads.length },
  { id: 'active', labelKey: 'downloads.filterActive', count: active.value.length },
  { id: 'completed', labelKey: 'downloads.filterCompleted', count: done.value.length },
  { id: 'failed', labelKey: 'downloads.filterFailed', count: failed.value.length }
]);

const icons = {
  downloading: Download,
  completed: CheckCircle,
  error: AlertCircle,
  cancelled: XCircle,
  pending: Clock,
  paused: Pause
} as const;
const colors = {
  downloading: 'text-accent-base',
  completed: 'text-green-base',
  error: 'text-red-base',
  cancelled: 'text-fg-faint',
  pending: 'text-amber-base',
  paused: 'text-amber-base'
} as const;
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default flex items-center gap-3">
      <Download :size="24" class="text-accent-base" />
      <h1 class="text-xl font-bold">{{ $t('downloads.title') }}</h1>
      <span
        v-if="active.length"
        class="text-xs bg-accent-ghost text-accent-base px-2 py-0.5 rounded-full font-medium"
        >{{ active.length }} {{ $t('status.active') }}</span
      >
      <div class="flex-1" />
      <button
        v-if="active.length"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
        :title="$t('downloads.pauseAll')"
        @click="yt.pauseAll"
      >
        <Pause :size="12" />
        {{ $t('downloads.pauseAll') }}
      </button>
      <button
        v-if="pausedCount"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
        :title="$t('downloads.resumeAll')"
        @click="yt.resumeAll"
      >
        <Play :size="12" />
        {{ $t('downloads.resumeAll') }}
      </button>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
        :title="$t('downloads.exportQueue')"
        @click="yt.exportQueue"
      >
        <Upload :size="12" />
        {{ $t('downloads.exportQueue') }}
      </button>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
        :title="$t('downloads.importQueue')"
        @click="yt.importQueue"
      >
        <Download :size="12" />
        {{ $t('downloads.importQueue') }}
      </button>
      <div class="flex items-center gap-1">
        <input
          v-model="scheduleTime"
          type="time"
          class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
          :title="$t('downloads.scheduleStart')"
        />
        <button
          class="px-2 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
          :disabled="!scheduleTime"
          @click="applySchedule"
        >
          {{ $t('downloads.scheduleSet') }}
        </button>
        <button
          v-if="scheduledAt"
          class="px-2 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
          :title="$t('downloads.scheduleClear')"
          @click="clearSchedule"
        >
          <X :size="12" />
        </button>
      </div>
      <button
        v-if="done.length || failed.length"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
        @click="yt.clearFinishedDownloads"
      >
        <Trash2 :size="12" />
        {{ $t('downloads.clearFinished') }}
      </button>
    </div>

    <div class="px-4 py-2 border-b border-border-default flex gap-1 items-center flex-wrap">
      <button
        v-for="f in filters"
        :key="f.id"
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
        :class="filter === f.id ? 'bg-accent-base text-white' : 'text-fg-muted hover:bg-bg-hover'"
        @click="filter = f.id"
      >
        {{ $t(f.labelKey) }} ({{ f.count }})
      </button>
      <div class="flex-1" />
      <select
        v-if="channels.length"
        v-model="channelFilter"
        class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
      >
        <option value="">{{ $t('downloads.filterAllChannels') }}</option>
        <option v-for="[id, title] in channels" :key="id" :value="id">{{ title }}</option>
      </select>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div v-if="visible.length" class="space-y-2">
        <div
          v-for="t in visible"
          :key="t.id"
          class="p-3 rounded-xl bg-bg-elevated border border-border-default"
        >
          <div class="flex items-center gap-3">
            <div class="w-20 aspect-video rounded-md bg-bg-base overflow-hidden shrink-0">
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
                :class="colors[t.status] || 'text-amber-base'"
              />
            </div>

            <div class="flex-1 min-w-0">
              <span class="text-sm flex-1 truncate block">{{ t.title }}</span>
              <span
                v-if="t.error"
                class="text-xs text-fg-faint line-clamp-1 block"
                :title="t.error"
              >
                {{ errorCodeKey(t.errorCode) ? $t(errorCodeKey(t.errorCode)) : t.error }}
              </span>
              <span
                v-else-if="t.outputPath"
                class="text-xs text-fg-faint truncate block"
                :title="t.outputPath"
              >
                {{ t.outputPath }}
              </span>
              <span
                v-if="t.fileHash"
                class="text-[10px] text-fg-faint font-mono flex items-center gap-1"
                :title="t.fileHash"
              >
                <span class="truncate">sha256: {{ t.fileHash.slice(0, 16) }}…</span>
                <button
                  class="p-0.5 rounded text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors shrink-0"
                  :title="$t('downloads.copyHash')"
                  @click="copyText(t.fileHash)"
                >
                  <Copy :size="10" />
                </button>
              </span>
              <span v-if="t.status === 'downloading'" class="text-xs text-fg-faint font-mono">
                {{ t.speed }} · {{ t.eta }}
              </span>
            </div>

            <button
              v-if="t.status === 'error' && t.errorCode === 'auth-required'"
              class="flex items-center gap-1 px-2 py-1 rounded-md bg-accent-ghost text-accent-base text-[11px] font-medium hover:bg-accent-base hover:text-white transition-colors shrink-0"
              :title="$t('downloads.loginTitle')"
              @click="login"
            >
              <LogIn :size="11" />
              {{ $t('downloads.login') }}
            </button>

            <span
              v-if="coverStatusKey(t)"
              class="text-[11px] shrink-0"
              :class="coverStatusClass(t)"
            >
              {{ $t(coverStatusKey(t)) }}
            </span>
            <span v-if="subtitleStatusKey(t)" class="text-[11px] text-fg-faint shrink-0">
              {{ $t(subtitleStatusKey(t)) }}
            </span>
            <span class="text-xs text-fg-faint shrink-0 uppercase">{{ t.format }}</span>

            <div class="flex items-center gap-1 shrink-0">
              <button
                v-if="t.status === 'completed' && t.outputPath"
                class="p-1.5 rounded-md text-fg-faint hover:text-accent-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.play')"
                @click="playDownload(t)"
              >
                <Play :size="14" />
              </button>
              <button
                v-if="t.status === 'completed' && t.outputPath"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.copyPath')"
                @click="copyPath(t.outputPath)"
              >
                <Copy :size="14" />
              </button>
              <button
                v-if="t.status === 'completed' && t.outputPath"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.openFolder')"
                @click="openFolder(t.outputPath)"
              >
                <FolderOpen :size="14" />
              </button>
              <button
                v-if="t.status === 'completed' && t.outputPath"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.editMetadata')"
                @click="openMetaEditor(t)"
              >
                <Pencil :size="14" />
              </button>
              <button
                v-if="t.inLibrary"
                class="flex items-center gap-1 px-2 py-1 rounded-md bg-accent-ghost text-accent-base text-[11px] font-medium hover:bg-accent-base hover:text-white transition-colors shrink-0"
                :title="$t('downloads.inLibraryTitle')"
                @click="openLibrary"
              >
                <Library :size="11" />
                {{ $t('downloads.inLibrary') }}
              </button>
              <button
                v-if="t.status === 'downloading'"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.pause')"
                @click="yt.pauseDownload(t.id)"
              >
                <Pause :size="14" />
              </button>
              <button
                v-if="t.status === 'paused'"
                class="p-1.5 rounded-md text-fg-faint hover:text-accent-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.resume')"
                @click="yt.resumeDownload(t.id)"
              >
                <Play :size="14" />
              </button>
              <button
                v-if="t.status === 'pending'"
                class="p-1.5 rounded-md text-fg-faint hover:text-accent-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.moveToFront')"
                @click="yt.moveToFront(t.id)"
              >
                <ArrowUpToLine :size="14" />
              </button>
              <button
                v-if="t.status === 'pending'"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.moveUp')"
                @click="yt.move(t.id, -1)"
              >
                <ArrowUp :size="14" />
              </button>
              <button
                v-if="t.status === 'pending'"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.moveDown')"
                @click="yt.move(t.id, 1)"
              >
                <ArrowDown :size="14" />
              </button>
              <button
                v-if="t.status === 'downloading' || t.status === 'pending'"
                class="p-1.5 rounded-md text-fg-faint hover:text-red-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.cancel')"
                @click="yt.cancelDownload(t.id)"
              >
                <X :size="14" />
              </button>
              <button
                v-if="t.status === 'paused'"
                class="p-1.5 rounded-md text-fg-faint hover:text-red-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.cancel')"
                @click="yt.cancelDownload(t.id)"
              >
                <X :size="14" />
              </button>
              <button
                v-if="t.status === 'error' || t.status === 'cancelled'"
                class="p-1.5 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
                :title="$t('downloads.retry')"
                @click="yt.retryDownload(t)"
              >
                <RotateCcw :size="14" />
              </button>
            </div>
          </div>

          <div
            v-if="t.status === 'downloading' || t.status === 'pending'"
            class="w-full h-1.5 bg-border-default rounded-full overflow-hidden mt-2"
          >
            <div class="h-full bg-accent-base rounded-full" :style="{ width: t.progress + '%' }" />
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center py-16 text-fg-faint">
        <Download :size="48" class="mb-3 opacity-30" />
        <p class="text-sm">{{ $t('downloads.empty') }}</p>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="metaTarget"
        class="fixed inset-0 z-9999 bg-black/50 flex items-center justify-center"
        @click.self="closeMetaEditor"
      >
        <div
          class="bg-bg-surface border border-border-default rounded-xl w-80 max-w-[92vw] shadow-2xl overflow-hidden"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <h3 class="text-sm font-semibold">{{ $t('downloads.editMetadata') }}</h3>
            <button
              class="p-1 rounded-md text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
              @click="closeMetaEditor"
            >
              <X :size="16" />
            </button>
          </div>
          <div class="px-4 py-4 space-y-3">
            <input
              v-model="metaArtist"
              class="w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
              :placeholder="$t('youtube.metaArtist')"
            />
            <input
              v-model="metaAlbum"
              class="w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
              :placeholder="$t('youtube.metaAlbum')"
            />
            <input
              v-model="metaYear"
              class="w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
              :placeholder="$t('youtube.metaYear')"
            />
          </div>
          <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
            <button
              class="px-4 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors"
              @click="closeMetaEditor"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              @click="saveMeta"
            >
              {{ $t('common.save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
