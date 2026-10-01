<script setup lang="ts">
import { ref, computed, type ComponentPublicInstance } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useRouter } from 'vue-router';
import { useOnlineStore } from '@renderer/stores/online';
import { usePlayerStore } from '@renderer/stores/player';
import { useViewSearch } from '@renderer/composables/useViewSearch';
import { writeString } from '@renderer/utils/localStore';
import {
  buildDownloadFilters,
  groupDownloads,
  visibleDownloads
} from '@renderer/utils/downloadsView';
import DownloadMetaDialog from '@renderer/components/downloads/DownloadMetaDialog.vue';
import DownloadFiltersBar from '@renderer/components/downloads/DownloadFiltersBar.vue';
import DownloadToolbar from '@renderer/components/downloads/DownloadToolbar.vue';
import DownloadRow from '@renderer/components/downloads/DownloadRow.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import type { DownloadTask } from '@renderer/types/online';
import type { MediaFile } from '@renderer/types/media';
import { Download } from '@lucide/vue';

const yt = useOnlineStore();
const router = useRouter();
const player = usePlayerStore();
const downloadListRef = ref<HTMLElement | null>(null);

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
  writeString('onda.libraryTab', tab);
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

const downloadVirtualizer = useVirtualizer({
  get count() {
    return visible.value.length;
  },
  getScrollElement: () => downloadListRef.value,
  estimateSize: () => 112,
  overscan: 8,
  measureElement: (element) => element.getBoundingClientRect().height
});

function measureDownloadRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) downloadVirtualizer.value.measureElement(node);
}
</script>

<template>
  <div data-testid="downloads-view" class="flex flex-col h-full">
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

    <div ref="downloadListRef" class="flex-1 min-h-0 overflow-auto p-4">
      <div
        v-if="visible.length"
        class="relative"
        :style="{ height: downloadVirtualizer.getTotalSize() + 'px' }"
      >
        <div
          v-for="row in downloadVirtualizer.getVirtualItems()"
          :key="visible[row.index].id"
          :ref="measureDownloadRow"
          :data-index="row.index"
          class="absolute top-0 left-0 w-full pb-2"
          :style="{ transform: `translateY(${row.start}px)` }"
        >
          <DownloadRow
            :task="visible[row.index]"
            @play="playDownload(visible[row.index])"
            @edit-meta="openMetaEditor(visible[row.index])"
            @open-library="openLibrary(visible[row.index])"
          />
        </div>
      </div>

      <EmptyState
        v-else
        :title="$t('downloads.empty')"
        :icon="Download"
        data-testid="downloads-empty"
      />
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
