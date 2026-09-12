<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Folder, ChevronDown, Shuffle, Play, ExternalLink } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { canonicalPath, basename, isUnderPath } from '@renderer/utils/path';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import { formatDuration } from '@renderer/utils/formatters';
import { getAllTracksIndexed } from '@renderer/utils/libraryIndex';
import DirNode from '@renderer/components/library/DirNode.vue';
import LibraryFolderTile from '@renderer/components/library/LibraryFolderTile.vue';

const library = useLibraryStore();
const player = usePlayerStore();
const { showFolderMenu } = useLibraryContextMenu();

const props = defineProps<{
  query: string;
}>();
import type { MediaFile } from '@renderer/types/media';
const emit = defineEmits<{
  playFolder: [folderPath: string];
  edit: [track: MediaFile];
}>();

// persystencja rozwinięć
const STORAGE_KEY = 'onda.libraryExpanded';
function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set<string>();
}
const expandedPaths = ref<Set<string>>(loadExpanded());
watch(
  () => [...expandedPaths.value].sort().join('|'),
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedPaths.value]));
    } catch {}
  }
);

function togglePath(fp: string) {
  const s = new Set(expandedPaths.value);
  const key = canonicalPath(fp);
  // keep original paths but compare canonical
  const has = [...s].some((v) => canonicalPath(v) === key);
  if (has) {
    for (const v of [...s]) if (canonicalPath(v) === key) s.delete(v);
  } else s.add(fp);
  expandedPaths.value = s;
}
function isExpanded(fp: string) {
  const key = canonicalPath(fp);
  return [...expandedPaths.value].some((v) => canonicalPath(v) === key);
}

function shuffleFolder(fp: string) {
  const tracks = getAllTracksIndexed(fp, library.tracks, library.folders).filter(
    (t) => t.type !== 'image'
  );
  if (tracks.length === 0) return;
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  player.clearQueue();
  if (shuffled.length > 1) player.addToQueueMultiple(shuffled.slice(1));
  player.setTrack(shuffled[0]);
  player.play();
}

function showInExplorer(fp: string) {
  window.api?.invoke('shell:showItemInFolder', fp);
}
function onFolderDrag(e: DragEvent, folderPath: string) {
  const tracks = getAllTracksIndexed(folderPath, library.tracks, library.folders).filter(
    (t) => t.type !== 'image'
  );
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: tracks.map((t) => t.path) }));
  e.dataTransfer!.effectAllowed = 'move';
}

interface FolderMeta {
  path: string;
  name: string;
  type: string;
  count: number;
  duration: number;
  mosaicTracks: typeof library.tracks;
  matchesQuery: boolean;
}

const folderMetas = computed<FolderMeta[]>(() => {
  const q = props.query.toLowerCase().trim();
  return library.folders
    .map((fp) => {
      const all = getAllTracksIndexed(fp, library.tracks, library.folders);
      const count = all.length;
      const duration = all.reduce((s, t) => s + (t.duration || 0), 0);
      // mozaika = po prostu pierwsze 4 pliki z listy (audio lub img) — Tile sam wybierze MediaCover vs <img>
      const mosaicTracks = all.slice(0, 4);
      const filtered = q
        ? all.filter((t) => t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q))
        : all;
      const matchesQuery = !q || filtered.length > 0;
      return {
        path: fp,
        name: basename(fp),
        type: library.getFolderType(fp),
        count,
        duration,
        mosaicTracks,
        matchesQuery
      };
    })
    .filter((m) => m.matchesQuery);
});

function folderTypeIcon(type: string): string {
  if (type === 'audio') return '🎵';
  if (type === 'video') return '🎬';
  if (type === 'image') return '🖼️';
  return '📁';
}

const noMatch = computed(
  () =>
    library.folders.length > 0 && folderMetas.value.length === 0 && props.query.trim().length > 0
);
</script>

<template>
  <div
    v-if="library.folders.length === 0"
    class="flex flex-col items-center justify-center h-full gap-4 p-8 text-base-content/50"
  >
    <div
      class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center"
    >
      <Folder :size="28" class="opacity-40" />
    </div>
    <div class="text-center">
      <p class="text-sm font-medium">{{ $t('library.noFolders') }}</p>
      <p class="text-xs mt-1 opacity-70">{{ $t('library.addFolderHint') }}</p>
    </div>
  </div>

  <div
    v-else-if="noMatch"
    class="flex flex-col items-center justify-center h-64 gap-3 text-base-content/50"
  >
    <Folder :size="28" class="opacity-30" />
    <p class="text-sm">Brak wyników dla "{{ query }}"</p>
  </div>

  <div v-else class="p-3 sm:p-4 space-y-3">
    <div
      v-for="meta in folderMetas"
      :key="meta.path"
      class="group rounded-box bg-base-100 border border-base-300 overflow-hidden hover:border-primary/20 hover:shadow-sm transition-all duration-150"
    >
      <!-- Glass header z mozaiką -->
      <div
        class="flex items-center gap-3 px-4 py-3 hover:bg-base-200/50 transition-colors"
        draggable="true"
        @dragstart="onFolderDrag($event, meta.path)"
        @contextmenu.prevent="
          showFolderMenu(
            $event,
            meta.path,
            library.tracks.filter((t) => isUnderPath(t.path, meta.path))
          )
        "
      >
        <LibraryFolderTile :tracks="meta.mosaicTracks" />

        <div class="flex-1 min-w-0 text-left">
          <div class="flex items-center gap-2">
            <span class="text-[11px]">{{ folderTypeIcon(meta.type) }}</span>
            <span class="text-sm font-semibold truncate">{{ meta.name }}</span>
            <span
              class="hidden sm:inline text-[11px] px-1.5 py-0.5 rounded-full bg-base-200 border border-base-300 text-base-content/60"
              >{{ meta.count }} {{ $t('library.folderFiles') }}</span
            >
            <span
              v-if="meta.duration > 0"
              class="hidden md:inline text-[11px] text-base-content/40"
              >{{ formatDuration(meta.duration, '') }}</span
            >
          </div>
          <div class="text-xs text-base-content/50 truncate hidden sm:block">{{ meta.path }}</div>
          <div class="text-xs text-base-content/50 sm:hidden">
            {{ meta.count }} plików<span v-if="meta.duration">
              · {{ formatDuration(meta.duration, '') }}</span
            >
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <button
            class="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center hover:bg-primary/90 transition-colors fx-depth fx-noise"
            :title="$t('library.folderPlay')"
            @click.stop="emit('playFolder', meta.path)"
          >
            <Play :size="14" class="ml-0.5 fill-current" />
          </button>
          <button
            class="hidden sm:flex w-8 h-8 rounded-full bg-base-200 border border-base-300 text-base-content/60 hover:text-primary hover:border-primary/30 items-center justify-center transition-colors"
            :title="$t('library.folderShuffle')"
            @click.stop="shuffleFolder(meta.path)"
          >
            <Shuffle :size="12" />
          </button>
          <button
            class="hidden sm:flex w-8 h-8 rounded-full bg-base-200 border border-base-300 text-base-content/60 hover:text-base-content items-center justify-center transition-colors"
            :title="$t('library.folderShowInExplorer')"
            @click.stop="showInExplorer(meta.path)"
          >
            <ExternalLink :size="12" />
          </button>
          <button
            class="w-8 h-8 rounded-full bg-base-200 border border-base-300 flex items-center justify-center hover:bg-base-300 transition-colors ml-1"
            @click="togglePath(meta.path)"
          >
            <ChevronDown
              :size="14"
              class="text-base-content/60 transition-transform duration-200"
              :class="isExpanded(meta.path) ? '' : '-rotate-90'"
            />
          </button>
        </div>
      </div>

      <div
        v-if="isExpanded(meta.path)"
        class="border-t border-base-300 bg-base-200/30 backdrop-blur-sm"
      >
        <DirNode
          :dir="meta.path"
          :depth="0"
          :expanded-paths="expandedPaths"
          :query="query"
          @toggle="togglePath"
          @play-folder="(p) => emit('playFolder', p)"
          @edit="emit('edit', $event)"
        />
      </div>
    </div>
  </div>
</template>
