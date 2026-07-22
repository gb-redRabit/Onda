<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';
import LibraryTrackRow from '@renderer/components/library/LibraryTrackRow.vue';
import LibraryPlaylistManager from '@renderer/components/library/LibraryPlaylistManager.vue';
import DirNode from '@renderer/components/library/DirNode.vue';
import TrackTagEditor from '@renderer/components/library/TrackTagEditor.vue';
import MusicBrainzLookup from '@renderer/components/library/MusicBrainzLookup.vue';
import AlbumCard from '@renderer/components/library/AlbumCard.vue';
import VideoCard from '@renderer/components/library/VideoCard.vue';
import {
  Music2,
  Film,
  Folder,
  Disc3,
  Mic2,
  ListMusic,
  Search,
  RefreshCw,
  ChevronDown
} from '@lucide/vue';

const { t } = useI18n();
const library = useLibraryStore();
const player = usePlayerStore();

const query = ref('');
const tab = ref<'tracks' | 'video' | 'folders' | 'artists' | 'albums' | 'playlists'>('tracks');

const tabs = computed(() => [
  { id: 'tracks', label: t('library.tracks'), icon: Music2 },
  { id: 'video', label: t('library.video'), icon: Film },
  { id: 'folders', label: t('library.folders'), icon: Folder },
  { id: 'artists', label: t('library.artists'), icon: Mic2 },
  { id: 'albums', label: t('library.albums'), icon: Disc3 },
  { id: 'playlists', label: t('library.playlists'), icon: ListMusic }
] as const);

const filteredTracks = computed(() => {
  const q = query.value.toLowerCase();
  return library.audioTracks.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.metadata?.title?.toLowerCase().includes(q) ||
      t.metadata?.artist?.toLowerCase().includes(q) ||
      t.metadata?.album?.toLowerCase().includes(q)
  );
});

const filteredVideo = computed(() => {
  const q = query.value.toLowerCase();
  return library.videoTracks.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.metadata?.title?.toLowerCase().includes(q)
  );
});

const filteredArtists = computed(() => {
  const q = query.value.toLowerCase();
  return library.artists.filter(([name]) => !q || name.toLowerCase().includes(q));
});

const filteredAlbums = computed(() => {
  const q = query.value.toLowerCase();
  return library.albums.filter(([name]) => !q || name.toLowerCase().includes(q));
});

const expandedPaths = ref(new Set<string>());
const editingTrack = ref<MediaFile | null>(null);
const showingMBLookup = ref(false);

function togglePath(fp: string) {
  const s = new Set(expandedPaths.value);
  if (s.has(fp)) s.delete(fp);
  else s.add(fp);
  expandedPaths.value = s;
}

function folderFileCount(fp: string): number {
  return library.tracks.filter((t) => t.path.startsWith(fp)).length;
}

function dirName(fp: string): string {
  return fp.split('\\').pop() || fp;
}

const allFolderTracks = computed(() => {
  const q = query.value.toLowerCase();
  return library.tracks.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q)
  );
});

const trackListRef = ref<HTMLElement | null>(null);

const trackVirtualizer = useVirtualizer({
  get count() {
    return filteredTracks.value.length;
  },
  getScrollElement: () => trackListRef.value,
  estimateSize: () => 48,
  overscan: 10
});

const videoGridRef = ref<HTMLElement | null>(null);
const videoCols = ref(6);

function updateVideoCols() {
  if (!videoGridRef.value) return;
  const w = videoGridRef.value.clientWidth;
  videoCols.value = Math.max(2, Math.floor(w / 210));
}

const videoRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(filteredVideo.value.length / videoCols.value);
  },
  getScrollElement: () => videoGridRef.value,
  estimateSize: () => 220,
  overscan: 3
});

const visibleVideo = computed(() => {
  const items = videoRowVirtualizer.value.getVirtualItems();
  const cols = videoCols.value;
  const result: Array<{ top: number; tracks: MediaFile[] }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, filteredVideo.value.length);
    result.push({
      top: row.start,
      tracks: filteredVideo.value.slice(start, end)
    });
  }
  return result;
});

const albumGridRef = ref<HTMLElement | null>(null);
const albumCols = ref(5);

function updateAlbumCols() {
  if (!albumGridRef.value) return;
  const w = albumGridRef.value.clientWidth;
  albumCols.value = Math.max(2, Math.floor(w / 200));
}

const albumRowVirtualizer = useVirtualizer({
  get count() {
    return Math.ceil(filteredAlbums.value.length / albumCols.value);
  },
  getScrollElement: () => albumGridRef.value,
  estimateSize: () => 210,
  overscan: 3
});

const visibleAlbums = computed(() => {
  const items = albumRowVirtualizer.value.getVirtualItems();
  const cols = albumCols.value;
  const result: Array<{ top: number; albums: Array<[string, MediaFile[]]> }> = [];
  for (const row of items) {
    const start = row.index * cols;
    const end = Math.min(start + cols, filteredAlbums.value.length);
    result.push({
      top: row.start,
      albums: filteredAlbums.value.slice(start, end)
    });
  }
  return result;
});

onMounted(() => {
  updateVideoCols();
  if (videoGridRef.value) {
    const ro = new ResizeObserver(() => updateVideoCols());
    ro.observe(videoGridRef.value);
    onUnmounted(() => ro.disconnect());
  }
  updateAlbumCols();
  if (albumGridRef.value) {
    const ro = new ResizeObserver(() => updateAlbumCols());
    ro.observe(albumGridRef.value);
  }
});

function playTracks(tracks: typeof library.tracks) {
  if (tracks.length === 0) return;
  player.clearQueue();
  player.addToQueueMultiple(tracks);
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
  const folderTracks = library.tracks.filter((t) => t.path.startsWith(folderPath));
  playTracks(folderTracks);
}

function folderTypeIcon(type: string): string {
  if (type === 'audio') return '🎵';
  if (type === 'video') return '🎬';
  return '📁';
}

watch(
  filteredVideo,
  (tracks) => {
    tracks.forEach((t) => player.loadCover(t.path));
  },
  { immediate: true }
);

watch(
  filteredTracks,
  (tracks) => {
    tracks.slice(0, 200).forEach((t) => player.loadCover(t.path));
  },
  { immediate: true }
);

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
  editingTrack.value.metadata = {
    ...(editingTrack.value.metadata || {}),
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    year: tags.year,
    genre: tags.genre,
    track: tags.track
  };
  if (tags.name) {
    editingTrack.value.name = tags.name + (editingTrack.value.name.match(/\.[^.]+$/)?.[0] || '');
  }
  if (tags.path) {
    const oldPath = editingTrack.value.path;
    editingTrack.value.path = tags.path;
    editingTrack.value.id = tags.path;
    player.invalidateCoverCache(oldPath);
  }
  library.refreshDerived();
  try {
    const files = JSON.parse(JSON.stringify(library.tracks));
    const folderTypes = JSON.parse(JSON.stringify(library.folderTypes));
    window.api?.invoke('library:saveScanned', { files, folderTypes }).catch(() => {});
  } catch (_e) { /* serialization failed silently */ }
}

function onMBApply(data: { title?: string; artist?: string; album?: string; year?: number; genre?: string; track?: { no: number }; coverData?: number[]; coverMime?: string }) {
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
    const files = JSON.parse(JSON.stringify(library.tracks));
    const folderTypes = JSON.parse(JSON.stringify(library.folderTypes));
    window.api?.invoke('library:saveScanned', { files, folderTypes }).catch(() => {});
  } catch (_e) { /* serialization failed silently */ }
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
          v-for="t in tabs"
          :key="t.id"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="tab === t.id ? 'bg-accent-base text-white' : 'text-fg-muted hover:bg-bg-hover'"
          @click="tab = t.id"
        >
          <component :is="t.icon" :size="14" />
          {{ t.label }}
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
      <!-- Utwory -->
      <template v-if="tab === 'tracks'">
        <div
          v-if="filteredTracks.length === 0"
          class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
        >
          <Music2 :size="48" class="opacity-30" />
          <p class="text-sm">{{ $t('library.noAudio') }}</p>
          <p class="text-xs">{{ $t('library.addFolderHint') }}</p>
        </div>
        <template v-else>
          <div
            class="flex items-center justify-between px-4 py-2 border-b border-border-default shrink-0"
          >
            <span class="text-xs text-fg-faint">{{ filteredTracks.length }} {{ $t('library.tracksCount') }}</span>
            <button
              class="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
              @click="playAllTracks"
            >
              <Music2 :size="12" /> {{ $t('library.playAll') }}
            </button>
          </div>
          <div ref="trackListRef" class="flex-1 overflow-auto">
            <div
              :style="{
                height: trackVirtualizer.getTotalSize() + 'px',
                width: '100%',
                position: 'relative'
              }"
            >
              <div
                v-for="v in trackVirtualizer.getVirtualItems()"
                :key="'track-' + v.key"
                :style="{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: v.size + 'px',
                  transform: 'translateY(' + v.start + 'px)'
                }"
              >
                <LibraryTrackRow
                  :track="filteredTracks[v.index]"
                  :show-playlist="true"
                  @edit="editingTrack = $event"
                />
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- Video -->
      <template v-else-if="tab === 'video'">
        <div
          v-if="filteredVideo.length === 0"
          class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
        >
          <Film :size="48" class="opacity-30" />
          <p class="text-sm">{{ $t('library.noVideo') }}</p>
          <p class="text-xs">{{ $t('library.addFolderHint') }}</p>
        </div>
        <template v-else>
          <div
            class="flex items-center justify-between px-4 py-2 border-b border-border-default shrink-0"
          >
            <span class="text-xs text-fg-faint">{{ filteredVideo.length }} {{ $t('library.files') }}</span>
            <button
              class="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
              @click="playAllVideo"
            >
              <Film :size="12" /> {{ $t('library.playAll') }}
            </button>
          </div>
          <div ref="videoGridRef" class="flex-1 overflow-auto p-4">
            <div
              :style="{ height: videoRowVirtualizer.getTotalSize() + 'px', position: 'relative' }"
            >
              <div
                v-for="row in visibleVideo"
                :key="'vr-' + row.top"
                :style="{
                  position: 'absolute',
                  top: row.top + 'px',
                  left: 0,
                  width: '100%',
                  display: 'flex',
                  gap: '12px',
                  padding: '6px'
                }"
              >
                <VideoCard
                  v-for="t in row.tracks"
                  :key="t.path"
                  :track="t"
                  @play="playTrack"
                />
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- Foldery -->
      <template v-else-if="tab === 'folders'">
        <div
          v-if="allFolderTracks.length === 0"
          class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
        >
          <Folder :size="48" class="opacity-30" />
          <p class="text-sm">{{ $t('library.noFolders') }}</p>
          <p class="text-xs">{{ $t('library.addFolderHint') }}</p>
        </div>
        <div v-else class="p-3 space-y-3">
          <div
            v-for="folderPath in library.folders"
            :key="folderPath"
            class="rounded-xl bg-bg-elevated border border-border-default overflow-hidden"
          >
            <button
              class="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors"
              @click="togglePath(folderPath)"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="text-lg shrink-0">{{
                  folderTypeIcon(library.getFolderType(folderPath))
                }}</span>
                <div class="min-w-0 text-left">
                  <div class="text-sm font-medium">{{ dirName(folderPath) }}</div>
                  <div class="text-xs text-fg-faint truncate">
                    {{ folderPath }} · {{ folderFileCount(folderPath) }} {{ $t('library.folderFiles') }}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
                  @click.stop="playFolder(folderPath)"
                >
                  <Music2 :size="12" /> {{ $t('folders.play') }}
                </button>
                <ChevronDown
                  :size="16"
                  class="text-fg-faint transition-transform duration-200"
                  :class="expandedPaths.has(folderPath) ? '' : '-rotate-90'"
                />
              </div>
            </button>
            <div v-if="expandedPaths.has(folderPath)" class="border-t border-border-default">
              <DirNode
                :dir="folderPath"
                :depth="0"
                :expanded-paths="expandedPaths"
                @toggle="togglePath"
              />
            </div>
          </div>
        </div>
      </template>

      <!-- Artyści -->
      <template v-else-if="tab === 'artists'">
        <div
          v-if="filteredArtists.length === 0"
          class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
        >
          <Mic2 :size="48" class="opacity-30" />
          <p class="text-sm">{{ $t('library.noArtists') }}</p>
        </div>
        <div v-else class="grid gap-3 p-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <button
            v-for="[name, tracks] in filteredArtists"
            :key="name"
            class="flex flex-col items-center p-4 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all text-center"
            @click="playTracks(tracks)"
          >
            <div
              class="w-16 h-16 rounded-full bg-accent-ghost flex items-center justify-center mb-2"
            >
              <Mic2 :size="24" class="text-accent-base" />
            </div>
            <div class="text-sm font-medium truncate w-full">{{ name }}</div>
            <div class="text-xs text-fg-faint mt-0.5">{{ tracks.length }} {{ $t('library.tracksCount') }}</div>
          </button>
        </div>
      </template>

      <!-- Albumy -->
      <template v-else-if="tab === 'albums'">
        <div
          v-if="filteredAlbums.length === 0"
          class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
        >
          <Disc3 :size="48" class="opacity-30" />
          <p class="text-sm">{{ $t('library.noAlbums') }}</p>
        </div>
        <template v-else>
          <div ref="albumGridRef" class="flex-1 overflow-auto p-4">
            <div
              :style="{ height: albumRowVirtualizer.getTotalSize() + 'px', position: 'relative' }"
            >
              <div
                v-for="row in visibleAlbums"
                :key="'ar-' + row.top"
                :style="{
                  position: 'absolute',
                  top: row.top + 'px',
                  left: 0,
                  width: '100%',
                  display: 'flex',
                  gap: '12px',
                  padding: '6px'
                }"
              >
                <AlbumCard
                  v-for="[name, tracks] in row.albums"
                  :key="name"
                  :name="name"
                  :tracks="tracks"
                  @play="playTracks"
                />
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- Playlisty -->
      <div v-else-if="tab === 'playlists'" class="h-full">
        <LibraryPlaylistManager />
      </div>
    </div>
  </div>
  <TrackTagEditor :track="editingTrack" @close="editingTrack = null" @saved="onTagSaved" />
  <MusicBrainzLookup
    v-if="showingMBLookup"
    @close="showingMBLookup = false"
    @apply="onMBApply"
  />
</template>
