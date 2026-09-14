<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useLibraryStore } from '@renderer/stores/library';
import { getAllTracksIndexed } from '@renderer/utils/libraryIndex';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import LibraryTracksTab from '@renderer/components/library/LibraryTracksTab.vue';
import LibraryToolbar from '@renderer/components/library/LibraryToolbar.vue';
import LibraryHeader from '@renderer/components/library/LibraryHeader.vue';
import LibraryVideoTab from '@renderer/components/library/LibraryVideoTab.vue';
import LibraryImagesTab from '@renderer/components/library/LibraryImagesTab.vue';
import LibraryFoldersTab from '@renderer/components/library/LibraryFoldersTab.vue';
import LibraryArtistsTab from '@renderer/components/library/LibraryArtistsTab.vue';
import LibraryAlbumsTab from '@renderer/components/library/LibraryAlbumsTab.vue';
import LibraryPlaylistManager from '@renderer/components/library/LibraryPlaylistManager.vue';
import LibraryOverviewTab from '@renderer/components/library/LibraryOverviewTab.vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { useLibraryFilters } from '@renderer/composables/useLibraryFilters';
import { useLibraryTagEditor } from '@renderer/composables/useLibraryTagEditor';
import { useViewSearch } from '@renderer/composables/useViewSearch';
import {
  applyLibraryChip,
  filterLibrarySearch,
  sortLibraryTracks,
  type ChipId,
  type SortKey
} from '@renderer/utils/libraryView';
import { isTabId, buildLibraryTabs, type TabId } from '@renderer/utils/libraryTabs';

// Modals only mounted on demand — lazy so the Library chunk stays lean (3.5).
const TrackTagEditor = defineAsyncComponent(
  () => import('@renderer/components/library/TrackTagEditor.vue')
);
const MusicBrainzLookup = defineAsyncComponent(
  () => import('@renderer/components/library/MusicBrainzLookup.vue')
);

const { t } = useI18n();
const library = useLibraryStore();
const settings = useSettingsStore();
const player = usePlayerStore();

const {
  query,
  debouncedQuery,
  filteredTracks,
  filteredVideo,
  filteredImages,
  filteredArtists,
  filteredAlbums
} = useLibraryFilters(library);
useViewSearch(query);
const { editingTrack, showingMBLookup, onTagSaved, onMBApply } = useLibraryTagEditor(
  library,
  player
);
const mbInitialQuery = ref('');
const mbBatchTracks = ref<typeof library.tracks | undefined>(undefined);
// 8.9 — odbierz query z menu kontekstowego (track → MusicBrainz)
function onMbEvent(e: Event) {
  const ce = e as CustomEvent<{
    query?: string;
    track?: (typeof library.tracks)[0];
    batchTracks?: typeof library.tracks;
  }>;
  mbInitialQuery.value = ce.detail?.query || '';
  mbBatchTracks.value = ce.detail?.batchTracks as unknown as typeof library.tracks | undefined;
  if (ce.detail?.track)
    editingTrack.value = ce.detail.track as unknown as typeof editingTrack.value;
  else if (ce.detail?.batchTracks?.[0])
    editingTrack.value = ce.detail.batchTracks[0] as unknown as typeof editingTrack.value;
  showingMBLookup.value = true;
}
onMounted(() => window.addEventListener('onda:openMusicbrainz', onMbEvent as unknown as never));
onUnmounted(() =>
  window.removeEventListener('onda:openMusicbrainz', onMbEvent as unknown as never)
);

// Tabs — overview default (Minimal Spotify)
const route = useRoute();
const storedTab = isTabId(route.query.tab)
  ? route.query.tab
  : (localStorage.getItem('onda.libraryTab') as TabId) || 'overview';
const tab = ref<TabId>(storedTab);
watch(tab, (v) => localStorage.setItem('onda.libraryTab', v));
// Navigation from other views (e.g. Downloads "in library") passes ?tab=… .
watch(
  () => route.query.tab,
  (q) => {
    if (isTabId(q)) tab.value = q;
  }
);

const viewMode = computed(() => settings.library.viewModes[tab.value] ?? 'list');
function setViewMode(mode: 'list' | 'grid') {
  const viewModes = { ...settings.library.viewModes, [tab.value]: mode };
  settings.updateLibrary({ viewModes });
}

// Spotify-like quick filters + sort (for tracks tab)
const chip = ref<ChipId>('all');
const sortKey = ref<SortKey>('added');
const sortDir = ref<'asc' | 'desc'>('desc');

const tabs = computed(() =>
  buildLibraryTabs(t, {
    total: library.totalCount,
    audio: library.audioCount,
    video: library.videoCount,
    images: library.imageCount,
    folders: library.folders.length,
    artists: library.artists.length,
    albums: library.albums.length,
    playlists: library.playlists.length
  })
);

// Dynamic tab collapse — instead of letting labels get cut off (ellipsis) when
// the window is too narrow, the tabs shrink gracefully: full label + count →
// icon + count → icon only. Measured against the actual available width, so it
// adapts to any window size, count lengths and translated labels.
const tabRow = ref<HTMLDivElement>();
type TabMode = 'full' | 'compact' | 'icon';
const tabMode = ref<TabMode>('full');

function measureTabMode() {
  const row = tabRow.value;
  if (!row) return;
  const width = row.clientWidth;
  if (width <= 0) return;
  const buttons = Array.from(row.querySelectorAll<HTMLElement>('[data-tab]'));
  const labels = row.querySelectorAll<HTMLElement>('[data-tab-label]');
  const badges = row.querySelectorAll<HTMLElement>('[data-tab-count]');
  if (
    buttons.length !== tabs.value.length ||
    labels.length !== tabs.value.length ||
    badges.length !== tabs.value.length
  )
    return;

  // Natural (un-truncated) widths of the current layout, so paddings and the
  // actual inter-tab gap come straight from the applied CSS.
  const contentW = buttons.map((b) => b.scrollWidth);
  const labelW = Array.from(labels, (l) => l.scrollWidth);
  const badgeW = Array.from(badges, (b) => b.offsetWidth);
  const gapPx = parseFloat(getComputedStyle(row).gap) || 4;
  const extras = gapPx * (tabs.value.length - 1) + 8; // inter-tab gaps + row px-1 padding
  const weight = tabs.value.map((t) => (t.id === tab.value ? 1.2 : 1));
  const fullNeed = tabs.value.reduce((acc, _t, i) => acc + weight[i] * contentW[i], 0) + extras;
  const compactNeed = fullNeed - tabs.value.reduce((acc, _t, i) => acc + weight[i] * labelW[i], 0);
  const iconNeed = compactNeed - tabs.value.reduce((acc, _t, i) => acc + weight[i] * badgeW[i], 0);

  let nextMode: TabMode = tabMode.value;
  if (width < iconNeed) nextMode = 'icon';
  else if (width < compactNeed) nextMode = 'compact';
  else if (width >= fullNeed * 1.05) nextMode = 'full';
  if (nextMode !== tabMode.value) tabMode.value = nextMode;
}

let tabResizeObserver: ResizeObserver | null = null;
onMounted(() => {
  measureTabMode();
  if (typeof ResizeObserver !== 'undefined' && tabRow.value) {
    tabResizeObserver = new ResizeObserver(() => measureTabMode());
    tabResizeObserver.observe(tabRow.value);
  }
  document.fonts?.ready?.then(() => measureTabMode());
});
watch(tabs, () => nextTick(measureTabMode));
onUnmounted(() => tabResizeObserver?.disconnect());

const chips = computed(() => [
  { id: 'all' as const, label: t('library.chipAll') },
  { id: 'liked' as const, label: t('library.chipLiked') },
  { id: 'recent' as const, label: t('library.chipRecent') },
  { id: 'most' as const, label: t('library.chipMost') }
]);

const filteredAll = computed(() => filterLibrarySearch(library.tracks, debouncedQuery.value));

const sortedFilteredTracks = computed(() =>
  sortLibraryTracks(
    applyLibraryChip(filteredTracks.value, chip.value, player.favorites),
    sortKey.value,
    sortDir.value
  )
);

function handleOverviewShowAll(section: string) {
  if (section === 'liked') chip.value = 'liked';
  else if (section === 'recent') {
    chip.value = 'all';
    sortKey.value = 'added';
    sortDir.value = 'desc';
  } else if (section === 'most') {
    chip.value = 'most';
    sortKey.value = 'plays';
    sortDir.value = 'desc';
  } else if (section === 'newest') {
    chip.value = 'all';
    sortKey.value = 'added';
    sortDir.value = 'desc';
  } else if (section === 'random') {
    chip.value = 'all';
    // shuffle is handled by overview itself
  }
  tab.value = 'tracks';
}

function openImageViewer(index: number) {
  const files = JSON.parse(
    JSON.stringify(
      filteredImages.value.map((tr) => ({
        name: tr.name,
        path: tr.path,
        isDirectory: false,
        size: tr.size,
        modifiedAt: tr.addedAt,
        createdAt: tr.addedAt,
        extension: tr.extension,
        mimeType: tr.mimeType
      }))
    )
  );
  window.api?.invoke('imageViewer:open', files, index);
}

function playTracks(tracks: typeof library.tracks) {
  if (tracks.length === 0) return;
  if (tracks[0].type === 'video') audioEngine.resume();
  player.clearQueue();
  if (tracks.length > 1) player.addToQueueMultiple(tracks.slice(1));
  player.setTrack(tracks[0]);
  player.play();
}

function playTrack(track: (typeof library.tracks)[0]) {
  playTracks([track]);
}

function playAllTracks() {
  playTracks(sortedFilteredTracks.value);
}
function shuffleAllTracks() {
  const shuffled = [...sortedFilteredTracks.value];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  playTracks(shuffled);
}

function playAllVideo() {
  playTracks(filteredVideo.value);
}

function playFolder(folderPath: string) {
  const folderTracks = getAllTracksIndexed(folderPath, library.tracks, library.folders).filter(
    (tr) => tr.type !== 'image'
  );
  playTracks(folderTracks);
}

function navigateToFolder(path: string) {
  tab.value = 'folders';
  query.value = path.split(/[\\/]/).pop() || '';
  try {
    const key = 'onda.libraryExpanded';
    const raw = localStorage.getItem(key);
    const set = raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    set.add(path);
    // dodaj też przodków żeby drzewo było rozwinięte do pliku
    let cur = path;
    while (cur.includes('/') || cur.includes('\\')) {
      const idx = Math.max(cur.lastIndexOf('/'), cur.lastIndexOf('\\'));
      if (idx <= 0) break;
      cur = cur.slice(0, idx);
      set.add(cur);
    }
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}

function onTrackEdit(tr: (typeof library.tracks)[0]) {
  editingTrack.value = tr;
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Sticky glass header — Minimal Spotify -->
    <div class="sticky top-0 z-10 backdrop-blur border-b border-base-300 shrink-0">
      <div class="px-4 pt-4 pb-3">
        <LibraryHeader
          :total-count="library.totalCount"
          :is-scanning="library.isScanning"
          :show-shuffle="tab === 'tracks'"
          @shuffle="shuffleAllTracks"
          @rescan="library.scanFolders()"
        />

        <!-- Tab bar — jedna linia, reaguje na szerokość: flex-1 + napisy chowane -->
        <div class="relative -mx-1" role="tablist" aria-label="Biblioteka">
          <div
            ref="tabRow"
            class="flex gap-1 sm:gap-1.5 px-1 pb-1 overflow-hidden"
            :data-mode="tabMode"
          >
            <button
              v-for="tabItem in tabs"
              :key="tabItem.id"
              role="tab"
              data-tab
              :aria-selected="tab === tabItem.id"
              :aria-label="tabItem.label"
              class="group flex flex-1 min-w-0 items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 rounded-field text-xs font-medium transition-all duration-150 border fx-depth hover:border-primary/30"
              :class="
                tab === tabItem.id
                  ? 'bg-primary text-primary-content border-primary fx-depth shadow-primary/20 flex-[1.2] backdrop-blur-sm'
                  : 'bg-base-100/(--glass-alpha) text-base-content/70 border-base-300 hover:bg-base-100/(--glass-alpha) hover:text-base-content backdrop-blur-sm'
              "
              :title="tabItem.label + ' (' + tabItem.count + ')'"
              @click="tab = tabItem.id as TabId"
            >
              <component
                :is="tabItem.icon"
                :size="14"
                class="shrink-0"
                :class="tab === tabItem.id ? 'opacity-90' : 'opacity-60 group-hover:opacity-100'"
              />
              <span data-tab-label class="truncate">{{ tabItem.label }}</span>
              <span
                data-tab-count
                class="ml-0.5 px-1 sm:px-1.5 py-0.5 rounded-selector text-[10px] font-bold leading-none shrink-0 border"
                :class="
                  tab === tabItem.id
                    ? 'bg-primary-content/20 text-primary-content border-primary-content/20'
                    : 'bg-base-300 text-base-content/60 border-base-300'
                "
                >{{ tabItem.count }}</span
              >
            </button>
          </div>
        </div>

        <LibraryToolbar
          v-model:query="query"
          v-model:sort-key="sortKey"
          v-model:sort-dir="sortDir"
          v-model:chip="chip"
          :tab="tab"
          :chips="chips"
          :count="sortedFilteredTracks.length"
          @open-musicbrainz="showingMBLookup = true"
        />
      </div>
    </div>

    <!-- Content -->
    <div v-if="library.isLoading && !library.isLoaded" class="flex-1 p-4 space-y-3">
      <div
        v-for="i in 6"
        :key="i"
        class="h-12 rounded-box bg-base-100 border border-base-300 animate-pulse"
      ></div>
    </div>
    <div v-else class="flex-1 flex flex-col min-h-0">
      <LibraryOverviewTab
        v-if="tab === 'overview'"
        :query="query"
        :filtered-all="filteredAll"
        @play="playTrack"
        @play-tracks="playTracks"
        @edit="onTrackEdit"
        @show-all="handleOverviewShowAll"
      />
      <LibraryTracksTab
        v-else-if="tab === 'tracks'"
        :tracks="sortedFilteredTracks"
        :view-mode="viewMode"
        :chip="chip"
        :query="debouncedQuery"
        @update:view-mode="setViewMode"
        @play="playTrack"
        @play-all="playAllTracks"
        @shuffle-all="shuffleAllTracks"
        @edit="onTrackEdit"
        @navigate-folder="navigateToFolder"
      />
      <LibraryVideoTab
        v-else-if="tab === 'video'"
        :tracks="filteredVideo"
        :view-mode="viewMode"
        @update:view-mode="setViewMode"
        @play="playTrack"
        @play-all="playAllVideo"
      />
      <LibraryImagesTab
        v-else-if="tab === 'images'"
        :images="filteredImages"
        @open="openImageViewer"
      />
      <LibraryFoldersTab
        v-else-if="tab === 'folders'"
        :query="query"
        @play-folder="playFolder"
        @edit="onTrackEdit"
      />
      <LibraryArtistsTab
        v-else-if="tab === 'artists'"
        :artists="filteredArtists"
        :view-mode="viewMode"
        @update:view-mode="setViewMode"
        @play-tracks="playTracks"
      />
      <LibraryAlbumsTab
        v-else-if="tab === 'albums'"
        :albums="filteredAlbums"
        :view-mode="viewMode"
        @update:view-mode="setViewMode"
        @play-tracks="playTracks"
      />
      <div v-else-if="tab === 'playlists'" class="h-full bg-base-100">
        <LibraryPlaylistManager />
      </div>
    </div>
  </div>
  <TrackTagEditor :track="editingTrack" @close="editingTrack = null" @saved="onTagSaved" />
  <MusicBrainzLookup
    v-if="showingMBLookup"
    :initial-query="mbInitialQuery"
    :track="editingTrack"
    :batch-tracks="mbBatchTracks"
    @close="
      showingMBLookup = false;
      mbBatchTracks = undefined;
    "
    @apply="onMBApply"
  />
</template>

<style scoped>
/* Tab collapse: 'compact' hides the text label, 'icon' hides the count too.
   Labels are never ellipsis-cut — they are removed when tight. Visibility is
   used (not display) so the layout stays stable and the width measurement
   never oscillates. */
[data-mode='compact'] [data-tab-label],
[data-mode='icon'] [data-tab-label],
[data-mode='icon'] [data-tab-count] {
  visibility: hidden;
}
</style>
