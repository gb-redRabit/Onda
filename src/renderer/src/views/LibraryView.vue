<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { logger } from '@shared/logger';
import { isUnderPath, useLibraryStore } from '@renderer/stores/library';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';
import type { FileItem } from '@renderer/types/explorer';
import LibraryTracksTab from '@renderer/components/library/LibraryTracksTab.vue';
import LibraryVideoTab from '@renderer/components/library/LibraryVideoTab.vue';
import LibraryImagesTab from '@renderer/components/library/LibraryImagesTab.vue';
import LibraryFoldersTab from '@renderer/components/library/LibraryFoldersTab.vue';
import LibraryArtistsTab from '@renderer/components/library/LibraryArtistsTab.vue';
import LibraryAlbumsTab from '@renderer/components/library/LibraryAlbumsTab.vue';
import LibraryPlaylistManager from '@renderer/components/library/LibraryPlaylistManager.vue';
import TrackTagEditor from '@renderer/components/library/TrackTagEditor.vue';
import MusicBrainzLookup from '@renderer/components/library/MusicBrainzLookup.vue';
import ImageViewer from '@renderer/components/explorer/ImageViewer.vue';
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
  Images
} from '@lucide/vue';

const { t } = useI18n();
const library = useLibraryStore();
const settings = useSettingsStore();
const player = usePlayerStore();

const query = ref('');
const debouncedQuery = ref('');
let queryTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  query,
  (q) => {
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(() => {
      debouncedQuery.value = q;
    }, 200);
  },
  { immediate: true }
);
onUnmounted(() => {
  if (queryTimer) clearTimeout(queryTimer);
});
const tab = ref<'tracks' | 'video' | 'images' | 'folders' | 'artists' | 'albums' | 'playlists'>(
  'tracks'
);

const viewMode = computed(() => settings.library.viewModes[tab.value] ?? 'list');

function setViewMode(mode: 'list' | 'grid') {
  const viewModes = { ...settings.library.viewModes, [tab.value]: mode };
  settings.updateLibrary({ viewModes });
}

const tabs = computed(
  () =>
    [
      { id: 'tracks', label: t('library.tracks'), icon: Music2 },
      { id: 'video', label: t('library.video'), icon: Film },
      { id: 'images', label: t('library.images'), icon: Images },
      { id: 'folders', label: t('library.folders'), icon: Folder },
      { id: 'artists', label: t('library.artists'), icon: Mic2 },
      { id: 'albums', label: t('library.albums'), icon: Disc3 },
      { id: 'playlists', label: t('library.playlists'), icon: ListMusic }
    ] as const
);

const filteredTracks = computed(() => {
  const q = debouncedQuery.value.toLowerCase();
  return library.audioTracks.filter(
    (tr) =>
      !q ||
      tr.name.toLowerCase().includes(q) ||
      tr.metadata?.title?.toLowerCase().includes(q) ||
      tr.metadata?.artist?.toLowerCase().includes(q) ||
      tr.metadata?.album?.toLowerCase().includes(q)
  );
});

const filteredVideo = computed(() => {
  const q = debouncedQuery.value.toLowerCase();
  return library.videoTracks.filter(
    (tr) => !q || tr.name.toLowerCase().includes(q) || tr.metadata?.title?.toLowerCase().includes(q)
  );
});

const filteredImages = computed(() => {
  const q = debouncedQuery.value.toLowerCase();
  return library.imageTracks.filter((tr) => !q || tr.name.toLowerCase().includes(q));
});

const imageViewerIndex = ref<number | null>(null);

const imageFileItems = computed<FileItem[]>(() =>
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
);

function openImageViewer(index: number) {
  imageViewerIndex.value = index;
}

const filteredArtists = computed(() => {
  const q = debouncedQuery.value.toLowerCase();
  return library.artists.filter(([name]) => !q || name.toLowerCase().includes(q));
});

const filteredAlbums = computed(() => {
  const q = debouncedQuery.value.toLowerCase();
  return library.albums.filter(([name]) => !q || name.toLowerCase().includes(q));
});

const editingTrack = ref<MediaFile | null>(null);
const showingMBLookup = ref(false);

let trackCoverDebounce: ReturnType<typeof setTimeout> | null = null;
let videoCoverDebounce: ReturnType<typeof setTimeout> | null = null;

function debouncedPreloadCovers(
  coverList: string[],
  debounce: { current: ReturnType<typeof setTimeout> | null },
  set: (v: ReturnType<typeof setTimeout> | null) => void
): void {
  if (debounce.current) clearTimeout(debounce.current);
  debounce.current = setTimeout(() => {
    set(null);
    for (const path of coverList) player.loadCover(path);
  }, 300);
}

function preloadTrackCovers(tracks: MediaFile[]): void {
  debouncedPreloadCovers(
    tracks.slice(0, 200).map((tr) => tr.path),
    { current: trackCoverDebounce },
    (v) => (trackCoverDebounce = v)
  );
}

function preloadVideoCovers(tracks: MediaFile[]): void {
  debouncedPreloadCovers(
    tracks.slice(0, 100).map((tr) => tr.path),
    { current: videoCoverDebounce },
    (v) => (videoCoverDebounce = v)
  );
}

onMounted(() => {
  requestAnimationFrame(() => {
    preloadTrackCovers(filteredTracks.value);
    preloadVideoCovers(filteredVideo.value);
  });
});

watch(filteredVideo, (tracks) => {
  preloadVideoCovers(tracks);
});

watch(filteredTracks, (tracks) => {
  preloadTrackCovers(tracks);
});

onUnmounted(() => {
  if (trackCoverDebounce) clearTimeout(trackCoverDebounce);
  if (videoCoverDebounce) clearTimeout(videoCoverDebounce);
});

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
  playTracks(filteredTracks.value);
}

function playAllVideo() {
  playTracks(filteredVideo.value);
}

function playFolder(folderPath: string) {
  const folderTracks = library.tracks.filter((tr) => isUnderPath(tr.path, folderPath));
  playTracks(folderTracks);
}

function onTagSaved(tags: {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  track?: { no: number };
  name?: string;
  path?: string;
}) {
  if (!editingTrack.value) return;
  const oldPath = editingTrack.value.path;
  library.updateTrack(
    oldPath,
    (track) => {
      track.metadata = {
        ...(track.metadata || {}),
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        year: tags.year,
        genre: tags.genre,
        track: tags.track
      };
      if (tags.name) {
        track.name = tags.name + (track.name.match(/\.[^.]+$/)?.[0] || '');
      }
      if (tags.path) {
        track.path = tags.path;
        track.id = tags.path;
      }
    },
    true
  );
  if (tags.path) {
    player.invalidateCoverCache(oldPath);
  }
  try {
    const files = structuredClone(library.tracks);
    const folderTypes = structuredClone(library.folderTypes);
    window.api
      ?.invoke('library:saveScanned', { files, folderTypes })
      .catch((err) => logger.error('Library', 'saveScanned', err));
  } catch (_e) {
    /* serialization failed silently */
  }
}

function onMBApply(data: {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  track?: { no: number };
  coverData?: number[];
  coverMime?: string;
}) {
  if (!editingTrack.value) return;
  editingTrack.value.metadata = {
    ...(editingTrack.value.metadata || {}),
    title: data.title || editingTrack.value.metadata?.title,
    artist: data.artist || editingTrack.value.metadata?.artist,
    album: data.album || editingTrack.value.metadata?.album,
    year: data.year || editingTrack.value.metadata?.year,
    genre: data.genre || editingTrack.value.metadata?.genre,
    track: data.track || editingTrack.value.metadata?.track
  };
  if (data.coverData) {
    window.api?.writeCover(editingTrack.value.path, data.coverData);
    player.invalidateCoverCache(editingTrack.value.path);
  }
  library.refreshDerived();
  try {
    const files = structuredClone(library.tracks);
    const folderTypes = structuredClone(library.folderTypes);
    window.api
      ?.invoke('library:saveScanned', { files, folderTypes })
      .catch((err) => logger.error('Library', 'saveScanned', err));
  } catch (_e) {
    /* serialization failed silently */
  }
  showingMBLookup.value = false;
  editingTrack.value = null;
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold">{{ $t('library.title') }}</h1>
        <div class="flex items-center gap-2 text-xs text-fg-faint">
          <span>{{ library.totalCount }} {{ $t('library.files') }}</span>
          <button
            class="p-1.5 rounded-lg hover:bg-bg-hover transition-colors"
            :title="$t('library.rescan')"
            @click="library.scanFolders()"
          >
            <RefreshCw :size="14" :class="{ 'animate-spin': library.isScanning }" />
          </button>
        </div>
      </div>

      <div class="flex gap-1 mb-3 overflow-x-auto">
        <button
          v-for="tabItem in tabs"
          :key="tabItem.id"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="
            tab === tabItem.id ? 'bg-accent-base text-white' : 'text-fg-muted hover:bg-bg-hover'
          "
          @click="tab = tabItem.id"
        >
          <component :is="tabItem.icon" :size="14" />
          {{ tabItem.label }}
        </button>
      </div>

      <div v-if="tab !== 'playlists'" class="flex gap-2">
        <div class="relative flex-1">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            v-model="query"
            :placeholder="$t('library.search')"
            class="w-full pl-9 pr-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
          />
        </div>
        <button
          v-if="tab === 'tracks'"
          class="px-3 py-2 rounded-xl bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
          :title="$t('library.searchInMusicBrainz')"
          @click="showingMBLookup = true"
        >
          <Disc3 :size="14" /> MusicBrainz
        </button>
      </div>
    </div>

    <div class="flex-1 flex flex-col min-h-0">
      <LibraryTracksTab
        v-if="tab === 'tracks'"
        :tracks="filteredTracks"
        :view-mode="viewMode"
        @update:view-mode="setViewMode"
        @play="playTrack"
        @play-all="playAllTracks"
        @edit="editingTrack = $event"
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
      <div v-else-if="tab === 'playlists'" class="h-full">
        <LibraryPlaylistManager />
      </div>
    </div>
  </div>
  <TrackTagEditor :track="editingTrack" @close="editingTrack = null" @saved="onTagSaved" />
  <MusicBrainzLookup v-if="showingMBLookup" @close="showingMBLookup = false" @apply="onMBApply" />
  <ImageViewer
    v-if="imageViewerIndex !== null"
    :files="imageFileItems"
    :initial-index="imageViewerIndex"
    @close="imageViewerIndex = null"
  />
</template>