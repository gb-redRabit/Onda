<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLibraryStore } from '@renderer/stores/library';
import { getAllTracksIndexed } from '@renderer/utils/libraryIndex';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import LibraryTracksTab from '@renderer/components/library/LibraryTracksTab.vue';
import LibraryVideoTab from '@renderer/components/library/LibraryVideoTab.vue';
import LibraryImagesTab from '@renderer/components/library/LibraryImagesTab.vue';
import LibraryFoldersTab from '@renderer/components/library/LibraryFoldersTab.vue';
import LibraryArtistsTab from '@renderer/components/library/LibraryArtistsTab.vue';
import LibraryAlbumsTab from '@renderer/components/library/LibraryAlbumsTab.vue';
import LibraryPlaylistManager from '@renderer/components/library/LibraryPlaylistManager.vue';
import LibraryOverviewTab from '@renderer/components/library/LibraryOverviewTab.vue';
import TrackTagEditor from '@renderer/components/library/TrackTagEditor.vue';
import MusicBrainzLookup from '@renderer/components/library/MusicBrainzLookup.vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import {
  Music2,
  Film,
  Folder,
  Disc3,
  Mic2,
  ListMusic,
  Search,
  RefreshCw,
  Images,
  LayoutDashboard,
  Shuffle,
  ChevronDown,
  ArrowUpDown
} from '@lucide/vue';
import { useLibraryFilters } from '@renderer/composables/useLibraryFilters';
import { useLibraryTagEditor } from '@renderer/composables/useLibraryTagEditor';
import { useViewSearch } from '@renderer/composables/useViewSearch';

const { t } = useI18n();
const library = useLibraryStore();
const settings = useSettingsStore();
const player = usePlayerStore();

const { query, debouncedQuery, filteredTracks, filteredVideo, filteredImages, filteredArtists, filteredAlbums } =
  useLibraryFilters(library);
useViewSearch(query);
const { editingTrack, showingMBLookup, onTagSaved, onMBApply } = useLibraryTagEditor(
  library,
  player
);
const mbInitialQuery = ref('');
const mbBatchTracks = ref<typeof library.tracks | undefined>(undefined);
// 8.9 — odbierz query z menu kontekstowego (track → MusicBrainz)
function onMbEvent(e: Event) {
  const ce = e as CustomEvent<{ query?: string; track?: typeof library.tracks[0]; batchTracks?: typeof library.tracks }>;
  mbInitialQuery.value = ce.detail?.query || '';
  mbBatchTracks.value = ce.detail?.batchTracks as unknown as typeof library.tracks | undefined;
  if (ce.detail?.track) editingTrack.value = ce.detail.track as unknown as typeof editingTrack.value;
  else if (ce.detail?.batchTracks?.[0]) editingTrack.value = ce.detail.batchTracks[0] as unknown as typeof editingTrack.value;
  showingMBLookup.value = true;
}
onMounted(() => window.addEventListener('onda:openMusicbrainz', onMbEvent as unknown as never));
onUnmounted(() => window.removeEventListener('onda:openMusicbrainz', onMbEvent as unknown as never));

// Tabs — overview default (Minimal Spotify)
type TabId = 'overview' | 'tracks' | 'video' | 'images' | 'folders' | 'artists' | 'albums' | 'playlists';
const storedTab = (localStorage.getItem('onda.libraryTab') as TabId) || 'overview';
const tab = ref<TabId>(storedTab as TabId);
watch(tab, (v) => localStorage.setItem('onda.libraryTab', v));

const viewMode = computed(() => settings.library.viewModes[tab.value] ?? 'list');
function setViewMode(mode: 'list' | 'grid') {
  const viewModes = { ...settings.library.viewModes, [tab.value]: mode };
  settings.updateLibrary({ viewModes });
}

// Spotify-like quick filters + sort (for tracks tab)
type ChipId = 'all' | 'liked' | 'recent' | 'most';
const chip = ref<ChipId>('all');
type SortKey = 'title' | 'artist' | 'album' | 'duration' | 'added' | 'plays';
const sortKey = ref<SortKey>('added');
const sortDir = ref<'asc' | 'desc'>('desc');

const tabs = computed(
  () =>
    [
      { id: 'overview', label: t('library.overview'), icon: LayoutDashboard, count: library.totalCount },
      { id: 'tracks', label: t('library.tracks'), icon: Music2, count: library.audioCount },
      { id: 'video', label: t('library.video'), icon: Film, count: library.videoCount },
      { id: 'images', label: t('library.images'), icon: Images, count: library.imageCount },
      { id: 'folders', label: t('library.folders'), icon: Folder, count: library.folders.length },
      { id: 'artists', label: t('library.artists'), icon: Mic2, count: library.artists.length },
      { id: 'albums', label: t('library.albums'), icon: Disc3, count: library.albums.length },
      { id: 'playlists', label: t('library.playlists'), icon: ListMusic, count: library.playlists.length }
    ] as const
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
  if (buttons.length !== tabs.value.length || labels.length !== tabs.value.length || badges.length !== tabs.value.length)
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

const filteredAll = computed(() => {
  const q = debouncedQuery.value.toLowerCase().trim();
  if (!q) return [] as typeof library.tracks;
  return library.tracks.filter(
    (tr) =>
      tr.type !== 'image' &&
      (tr.name.toLowerCase().includes(q) ||
        tr.metadata?.title?.toLowerCase().includes(q) ||
        tr.metadata?.artist?.toLowerCase().includes(q) ||
        tr.metadata?.album?.toLowerCase().includes(q) ||
        tr.path.toLowerCase().includes(q))
  );
});

const sortedFilteredTracks = computed(() => {
  let list = [...filteredTracks.value];
  // chip filter
  if (chip.value === 'liked') {
    const fav = new Set(player.favorites);
    list = list.filter((tr) => fav.has(tr.path));
  } else if (chip.value === 'recent') {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const recent = list.filter((tr) => tr.addedAt > cutoff);
    list = recent.length >= 3 ? recent : list;
    // force sort by added desc for this chip
    if (chip.value === 'recent' && sortKey.value !== 'added') {
      // keep user sort but default to added desc if not set
    }
  } else if (chip.value === 'most') {
    list = list.filter((tr) => tr.playCount > 0);
  }
  // sort
  const dir = sortDir.value === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    switch (sortKey.value) {
      case 'title':
        va = (a.metadata?.title || a.name).toLowerCase();
        vb = (b.metadata?.title || b.name).toLowerCase();
        return va.localeCompare(vb as string) * dir;
      case 'artist':
        va = (a.metadata?.artist || '').toLowerCase();
        vb = (b.metadata?.artist || '').toLowerCase();
        return (va as string).localeCompare(vb as string) * dir;
      case 'album':
        va = (a.metadata?.album || '').toLowerCase();
        vb = (b.metadata?.album || '').toLowerCase();
        return (va as string).localeCompare(vb as string) * dir;
      case 'duration':
        va = a.duration || 0;
        vb = b.duration || 0;
        return ((va as number) - (vb as number)) * dir;
      case 'added':
        va = a.addedAt || 0;
        vb = b.addedAt || 0;
        return ((va as number) - (vb as number)) * dir;
      case 'plays':
        va = a.playCount || 0;
        vb = b.playCount || 0;
        return ((va as number) - (vb as number)) * dir;
    }
    return 0;
  });
  return list;
});

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
  const folderTracks = getAllTracksIndexed(folderPath, library.tracks, library.folders).filter((tr) => tr.type !== 'image');
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
    <div class="sticky top-0 z-10  backdrop-blur  border-b border-base-300 shrink-0">
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <h1 class="text-xl font-bold tracking-tight shrink-0">{{ $t('library.title') }}</h1>
            <span class="hidden sm:inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-base-100 border border-base-300 text-base-content/60">
              <span v-if="library.isScanning" class="w-2 h-2 rounded-full bg-success animate-pulse"></span>
              <span v-else class="w-2 h-2 rounded-full bg-base-300"></span>
              {{ library.totalCount }} {{ $t('library.files') }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              v-if="tab === 'tracks'"
              class="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-base-100/(--glass-alpha) border border-base-300 text-xs hover:border-primary/50 hover:text-primary transition-colors"
              :title="$t('library.shuffleAll')"
              @click="shuffleAllTracks"
            >
              <Shuffle :size="12" /> <span class="hidden lg:inline">{{ $t('library.shuffle') }}</span>
            </button>
            <button
              class="p-2 rounded-full bg-base-100/(--glass-alpha) border border-base-300 hover:border-primary/30 hover:text-primary transition-colors"
              :title="$t('library.rescan')"
              @click="library.scanFolders()"
            >
              <RefreshCw :size="14" :class="{ 'animate-spin': library.isScanning }" />
            </button>
          </div>
        </div>

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
              <component :is="tabItem.icon" :size="14" class="shrink-0" :class="tab === tabItem.id ? 'opacity-90' : 'opacity-60 group-hover:opacity-100'" />
              <span data-tab-label class="truncate">{{ tabItem.label }}</span>
              <span
                data-tab-count
                class="ml-0.5 px-1 sm:px-1.5 py-0.5 rounded-selector text-[10px] font-bold leading-none shrink-0 border"
                :class="tab === tabItem.id ? 'bg-primary-content/20 text-primary-content border-primary-content/20' : 'bg-base-300 text-base-content/60 border-base-300'"
              >{{ tabItem.count }}</span>
            </button>
          </div>
        </div>

        <!-- Search + controls row -->
        <div v-if="tab !== 'playlists'" class="flex gap-2 mt-3">
          <div class="relative flex-1 group">
            <Search
              :size="14"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 group-focus-within:text-primary transition-colors"
            />
            <input
              v-model="query"
              :placeholder="tab === 'overview' ? $t('library.searchPlaceholder') : $t('library.search')"
              class="w-full pl-9 pr-8 py-2.5 rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-base-content/40 transition-all"
            />
            <button
              v-if="query"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-selector hover:bg-base-300 text-base-content/40 hover:text-base-content transition-colors"
              @click="query = ''"
            >
              ×
            </button>
          </div>

          <!-- Sort + view mode for tracks -->
          <div v-if="tab === 'tracks'" class="hidden sm:flex items-center gap-1.5 shrink-0">
            <div class="relative">
              <select
                v-model="sortKey"
                class="appearance-none pl-2.5 pr-6 py-2.5 rounded-field bg-base-100 border border-base-300 text-xs font-medium focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="added">{{ $t('library.sortAdded') }}</option>
                <option value="title">{{ $t('library.sortTitle') }}</option>
                <option value="artist">{{ $t('library.sortArtist') }}</option>
                <option value="album">{{ $t('library.sortAlbum') }}</option>
                <option value="duration">{{ $t('library.sortDuration') }}</option>
                <option value="plays">{{ $t('library.sortPlays') }}</option>
              </select>
              <ChevronDown :size="12" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/40" />
            </div>
            <button
              class="p-2.5 rounded-selector bg-base-100 border border-base-300 hover:border-primary/30 text-base-content/60 hover:text-primary transition-colors"
              :title="sortDir === 'asc' ? '↑' : '↓'"
              @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
            >
              <ArrowUpDown :size="14" :class="sortDir === 'desc' ? 'rotate-180' : ''" class="transition-transform" />
            </button>
          </div>

          <button
            v-if="tab === 'tracks'"
            class="hidden md:flex items-center gap-1.5 px-3 py-2.5 rounded-field bg-primary/10 text-primary text-xs font-medium hover:bg-primary hover:text-primary-content transition-colors shrink-0 border border-primary/20 fx-depth"
            :title="$t('library.searchInMusicBrainz')"
            @click="showingMBLookup = true"
          >
            <Disc3 :size="14" /> <span class="hidden xl:inline">MusicBrainz</span>
          </button>
        </div>

        <!-- Quick filter chips — Spotify-like -->
        <div v-if="tab === 'tracks'" class="flex gap-1.5 mt-2.5 overflow-x-auto scrollbar-none pb-1" style="scrollbar-width:none">
          <button
            v-for="c in chips"
            :key="c.id"
            class="px-3 py-1.5 rounded-selector text-xs font-medium whitespace-nowrap border transition-all duration-150"
            :class="chip === c.id ? 'bg-base-content text-base-100 border-base-content' : 'bg-base-100 text-base-content/70 border-base-300 hover:border-base-content/20 hover:text-base-content'"
            @click="chip = c.id as ChipId"
          >
            {{ c.label }}
          </button>
          <span class="ml-auto text-[11px] text-base-content/40 self-center hidden sm:inline">{{ sortedFilteredTracks.length }} {{ $t('library.tracksCount') }}</span>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div v-if="library.isLoading && !library.isLoaded" class="flex-1 p-4 space-y-3">
      <div v-for="i in 6" :key="i" class="h-12 rounded-box bg-base-100 border border-base-300 animate-pulse"></div>
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
      <LibraryFoldersTab v-else-if="tab === 'folders'" :query="query" @play-folder="playFolder" @edit="onTrackEdit" />
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
  <MusicBrainzLookup v-if="showingMBLookup" :initial-query="mbInitialQuery" :track="editingTrack" :batch-tracks="mbBatchTracks" @close="showingMBLookup = false; mbBatchTracks = undefined" @apply="onMBApply" />
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
