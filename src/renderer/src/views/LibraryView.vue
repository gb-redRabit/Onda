<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import LibraryTrackRow from '@renderer/components/library/LibraryTrackRow.vue';
import LibraryPlaylistManager from '@renderer/components/library/LibraryPlaylistManager.vue';
import DirNode from '@renderer/components/library/DirNode.vue';
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

const library = useLibraryStore();
const player = usePlayerStore();

const query = ref('');
const tab = ref<'tracks' | 'video' | 'folders' | 'artists' | 'albums' | 'playlists'>('tracks');

const tabs = [
  { id: 'tracks', label: 'Utwory', icon: Music2 },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'folders', label: 'Foldery', icon: Folder },
  { id: 'artists', label: 'Artyści', icon: Mic2 },
  { id: 'albums', label: 'Albumy', icon: Disc3 },
  { id: 'playlists', label: 'Playlisty', icon: ListMusic }
] as const;

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

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold">Biblioteka</h1>
        <div class="flex items-center gap-2 text-xs text-fg-faint">
          <span>{{ library.totalCount }} plików</span>
          <button
            class="p-1.5 rounded-lg hover:bg-bg-hover transition-colors"
            title="Przeskanuj ponownie"
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

      <div v-if="tab !== 'playlists'" class="relative">
        <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
        <input
          v-model="query"
          placeholder="Szukaj..."
          class="w-full pl-9 pr-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
        />
      </div>
    </div>

    <div class="flex-1 overflow-auto min-h-0">
      <!-- Utwory -->
      <template v-if="tab === 'tracks'">
        <div
          v-if="filteredTracks.length === 0"
          class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
        >
          <Music2 :size="48" class="opacity-30" />
          <p class="text-sm">Brak utworów audio</p>
          <p class="text-xs">Dodaj foldery w Ustawieniach > Biblioteka</p>
        </div>
        <template v-else>
          <div class="flex items-center justify-between px-4 py-2 border-b border-border-default">
            <span class="text-xs text-fg-faint">{{ filteredTracks.length }} utworów</span>
            <button
              class="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
              @click="playAllTracks"
            >
              <Music2 :size="12" /> Odtwarzaj wszystko
            </button>
          </div>
          <div class="py-1">
            <LibraryTrackRow
              v-for="t in filteredTracks"
              :key="t.path"
              :track="t"
              :show-playlist="true"
            />
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
          <p class="text-sm">Brak plików wideo</p>
          <p class="text-xs">Dodaj foldery w Ustawieniach > Biblioteka</p>
        </div>
        <template v-else>
          <div class="flex items-center justify-between px-4 py-2 border-b border-border-default">
            <span class="text-xs text-fg-faint">{{ filteredVideo.length }} plików</span>
            <button
              class="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
              @click="playAllVideo"
            >
              <Film :size="12" /> Odtwarzaj wszystko
            </button>
          </div>
          <div
            class="grid gap-3 p-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            <button
              v-for="t in filteredVideo"
              :key="t.path"
              class="flex flex-col rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all overflow-hidden group text-left"
              @click="playTrack(t)"
            >
              <div
                class="aspect-video bg-bg-overlay flex items-center justify-center relative overflow-hidden"
              >
                <img
                  v-if="player.getCover(t.path).type === 'image'"
                  :src="player.getCover(t.path).data || ''"
                  class="w-full h-full object-cover"
                />
                <img
                  v-else-if="player.getCover(t.path).type === 'video'"
                  :src="'file:///' + player.getCover(t.path).data"
                  class="w-full h-full object-cover"
                />
                <Film v-else :size="32" class="text-fg-faint/40" />
                <div
                  class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
                >
                  <div
                    class="w-10 h-10 rounded-full bg-accent-base/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Music2 :size="18" class="text-white ml-0.5" />
                  </div>
                </div>
              </div>
              <div class="p-2.5">
                <div class="text-xs font-medium truncate">{{ t.name }}</div>
                <div class="text-[11px] text-fg-faint mt-0.5">{{ formatSize(t.size) }}</div>
              </div>
            </button>
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
          <p class="text-sm">Brak folderów</p>
          <p class="text-xs">Dodaj foldery w Ustawieniach > Biblioteka</p>
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
                    {{ folderPath }} · {{ folderFileCount(folderPath) }} plików
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
                  @click.stop="playFolder(folderPath)"
                >
                  <Music2 :size="12" /> Odtwarzaj
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
          <p class="text-sm">Brak artystów</p>
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
            <div class="text-xs text-fg-faint mt-0.5">{{ tracks.length }} utworów</div>
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
          <p class="text-sm">Brak albumów</p>
        </div>
        <div v-else class="grid gap-3 p-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <button
            v-for="[name, tracks] in filteredAlbums"
            :key="name"
            class="flex flex-col p-3 rounded-xl bg-bg-elevated border border-border-default hover:bg-bg-hover transition-all text-left"
            @click="playTracks(tracks)"
          >
            <div
              class="w-full aspect-square rounded-lg bg-bg-overlay mb-2 flex items-center justify-center"
            >
              <Disc3 :size="24" class="text-fg-faint/40" />
            </div>
            <div class="text-sm font-medium truncate">{{ name }}</div>
            <div class="text-xs text-fg-faint mt-0.5">{{ tracks.length }} utworów</div>
          </button>
        </div>
      </template>

      <!-- Playlisty -->
      <div v-else-if="tab === 'playlists'" class="h-full">
        <LibraryPlaylistManager />
      </div>
    </div>
  </div>
</template>
