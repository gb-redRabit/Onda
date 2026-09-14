<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { ChevronDown, Folder, Play, ExternalLink } from '@lucide/vue';
import { canonicalPath, isUnderPath, dirname } from '@renderer/utils/path';
import { formatDuration } from '@renderer/utils/formatters';
import type { MediaFile } from '@renderer/types/media';
import { getChildDirsIndexed, getAllTracksIndexed } from '@renderer/utils/libraryIndex';
import {
  buildChildMeta,
  directTracksInDir,
  EMPTY_CHILD_META,
  type DirChildMeta
} from '@renderer/utils/dirNode';
import LibraryFolderTile from './LibraryFolderTile.vue';
import DirMixedPreview from './DirMixedPreview.vue';
import DirChildFiles from './DirChildFiles.vue';
import DirDirectFiles from './DirDirectFiles.vue';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import { useThumbnails } from '@renderer/composables/useThumbnails';

const props = withDefaults(
  defineProps<{
    dir: string;
    depth: number;
    expandedPaths: Set<string>;
    query?: string;
  }>(),
  { query: '' }
);

const emit = defineEmits<{
  toggle: [path: string];
  playFolder: [path: string];
  edit: [track: MediaFile];
}>();

const library = useLibraryStore();
const player = usePlayerStore();
const { showFolderMenu } = useLibraryContextMenu();
const { request: requestThumb, getThumb } = useThumbnails(180);

function isExpanded(p: string) {
  const key = canonicalPath(p);
  return [...props.expandedPaths].some((v) => canonicalPath(v) === key);
}

const childDirNames = computed(() => {
  return getChildDirsIndexed(props.dir, library.tracks, library.folders);
});

function childCanonical(name: string) {
  return canonicalPath(props.dir) + '/' + name;
}
function childOriginal(name: string) {
  // reconstruct with original sep style if needed — canonical slash works with isUnderPath
  return childCanonical(name);
}

const directHere = computed(() =>
  directTracksInDir(props.dir, library.tracks, library.folders, props.query)
);
const directAudioHere = computed(() => directHere.value.filter((t) => t.type !== 'image'));
const directImagesHere = computed(() => directHere.value.filter((t) => t.type === 'image'));

const audioDisplayLimit = ref(50);
const imageDisplayLimit = ref(24);

const childMeta = computed(() =>
  buildChildMeta(props.dir, childDirNames.value, library.tracks, library.folders, props.query)
);
function metaFor(name: string): DirChildMeta {
  return childMeta.value[name] ?? EMPTY_CHILD_META;
}
watch(
  () => props.query + '|' + directHere.value.length,
  () => {
    audioDisplayLimit.value = 50;
    imageDisplayLimit.value = 24;
  }
);
// mieszany widok: foldery + okładki (max 3 foldery gdy są też pliki, bo 4 foldery = brak miejsca na okładki)
const isMixed = computed(() => childDirNames.value.length > 0 && directHere.value.length > 0);
const previewFolders = computed(() => {
  if (!isMixed.value) return [] as string[];
  return childDirNames.value.slice(0, 3);
});
const previewFiles = computed(() => {
  if (!isMixed.value) return [] as typeof directHere.value;
  const slots = 4 - previewFolders.value.length;
  if (slots <= 0) return [];
  return directHere.value.slice(0, slots);
});

watch(
  () =>
    directImagesHere.value
      .slice(0, imageDisplayLimit.value)
      .map((p) => p.path)
      .join('|'),
  () => {
    const shown = directImagesHere.value.slice(0, imageDisplayLimit.value);
    if (shown.length) requestThumb(shown.map((p) => p.path));
  },
  { immediate: true }
);
watch(
  () => previewFiles.value.map((p) => p.path).join('|'),
  () => {
    const vids = previewFiles.value.filter((p) => p.type === 'image' || p.type === 'video');
    if (vids.length) requestThumb(vids.map((p) => p.path));
  },
  { immediate: true }
);

function folderTracksFor(name: string) {
  return metaFor(name).audio.slice(0, 4);
}
function previewToggle(sub: string) {
  emit('toggle', childOriginal(sub));
}
function previewEdit(track: MediaFile) {
  emit('edit', track);
}
function onFolderDrag(e: DragEvent, folderPath: string) {
  const tracks = getAllTracksIndexed(folderPath, library.tracks, library.folders).filter(
    (t) => t.type !== 'image'
  );
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: tracks.map((t) => t.path) }));
  e.dataTransfer!.effectAllowed = 'move';
}
function playDir(fp: string) {
  const tracks = library.tracks.filter(
    (t) =>
      isUnderPath(t.path, fp) &&
      t.type !== 'image' &&
      (!props.query ||
        t.name.toLowerCase().includes(props.query.toLowerCase().trim()) ||
        t.path.toLowerCase().includes(props.query.toLowerCase().trim()))
  );
  if (tracks.length === 0) return;
  player.clearQueue();
  if (tracks.length > 1) player.addToQueueMultiple(tracks.slice(1));
  player.setTrack(tracks[0]);
  player.play();
}
function openExplorer(p: string) {
  window.api?.invoke('shell:showItemInFolder', p);
}
function openImageViewer(imagePath: string) {
  const imgs = directHere.value.filter((t) => t.type === 'image');
  const files = imgs.map((tr) => ({
    name: tr.name,
    path: tr.path,
    isDirectory: false,
    size: tr.size,
    modifiedAt: tr.addedAt,
    createdAt: tr.addedAt,
    extension: tr.extension,
    mimeType: tr.mimeType
  }));
  const idx = imgs.findIndex((t) => t.path === imagePath);
  window.api?.invoke('imageViewer:open', JSON.parse(JSON.stringify(files)), Math.max(0, idx));
}
function openImageViewerForChild(childName: string, imagePath: string) {
  const childDir = childOriginal(childName);
  const imgs = library.tracks.filter(
    (t) => t.type === 'image' && canonicalPath(dirname(t.path)) === canonicalPath(childDir)
  );
  const files = imgs.map((tr) => ({
    name: tr.name,
    path: tr.path,
    isDirectory: false,
    size: tr.size,
    modifiedAt: tr.addedAt,
    createdAt: tr.addedAt,
    extension: tr.extension,
    mimeType: tr.mimeType
  }));
  const idx = imgs.findIndex((t) => t.path === imagePath);
  window.api?.invoke('imageViewer:open', JSON.parse(JSON.stringify(files)), Math.max(0, idx));
}
</script>

<template>
  <!-- mieszany podgląd: foldery + okładki (max 3 foldery) -->
  <DirMixedPreview
    v-if="isMixed"
    :folders="previewFolders"
    :files="previewFiles"
    :meta="childMeta"
    :get-thumb="getThumb"
    @toggle="previewToggle"
    @play="playDir"
    @open-image="openImageViewer"
    @edit="previewEdit"
  />

  <div class="divide-y divide-base-300/50">
    <div v-for="sub in childDirNames" :key="sub">
      <div
        class="group/row flex items-center gap-2 py-2 pr-3 text-xs hover:bg-base-100/60 transition-colors"
        :style="{ paddingLeft: 16 + depth * 16 + 'px' }"
        draggable="true"
        @dragstart="onFolderDrag($event, childOriginal(sub))"
      >
        <button
          class="flex items-center gap-2 flex-1 min-w-0 text-left"
          @click="emit('toggle', childOriginal(sub))"
          @contextmenu.prevent="showFolderMenu($event, childOriginal(sub), metaFor(sub).subtree)"
        >
          <ChevronDown
            :size="12"
            class="transition-transform duration-150 shrink-0 text-base-content/40"
            :class="isExpanded(childOriginal(sub)) ? '' : '-rotate-90'"
          />
          <LibraryFolderTile
            :tracks="folderTracksFor(sub)"
            class="w-8 h-8 !rounded-field shrink-0 hidden sm:grid"
          />
          <Folder :size="13" class="shrink-0 text-primary/70 sm:hidden" />
          <span
            class="font-medium truncate text-base-content/80 group-hover/row:text-base-content"
            >{{ sub }}</span
          >
          <span
            class="ml-auto text-[11px] px-1.5 py-0.5 rounded-full bg-base-100 border border-base-300 text-base-content/60 shrink-0"
          >
            {{ metaFor(sub).audioCount }}
          </span>
          <span
            v-if="metaFor(sub).duration > 0"
            class="text-[11px] text-base-content/40 hidden sm:inline"
          >
            {{ formatDuration(metaFor(sub).duration, '') }}
          </span>
        </button>

        <button
          class="w-6 h-6 rounded-full bg-base-100 border border-base-300 text-base-content/50 hover:text-primary hover:border-primary/30 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all shrink-0"
          :title="$t('library.folderPlay')"
          @click.stop="playDir(childOriginal(sub))"
        >
          <Play :size="10" class="ml-px fill-current" />
        </button>
        <button
          class="w-6 h-6 rounded-full bg-base-100 border border-base-300 text-base-content/40 hover:text-base-content flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all shrink-0 hidden sm:flex"
          title="Pokaż w folderze"
          @click.stop="openExplorer(childOriginal(sub))"
        >
          <ExternalLink :size="10" />
        </button>
      </div>

      <div v-if="isExpanded(childOriginal(sub))" class="bg-base-100/30 border-t border-base-300/30">
        <DirNode
          :dir="childOriginal(sub)"
          :depth="depth + 1"
          :expanded-paths="expandedPaths"
          :query="query"
          @toggle="emit('toggle', $event)"
          @play-folder="emit('playFolder', $event)"
          @edit="emit('edit', $event)"
        />
        <DirChildFiles
          :meta="metaFor(sub)"
          :child-name="sub"
          :get-thumb="getThumb"
          @open-image="openImageViewerForChild"
          @edit="previewEdit"
        />
        <div
          v-if="
            metaFor(sub).directAll.length === 0 &&
            childDirNames.length === 0 &&
            directHere.length === 0
          "
          class="px-4 py-2 text-xs text-base-content/40 italic"
          :style="{ paddingLeft: 16 + (depth + 1) * 16 + 'px' }"
        >
          {{ $t('library.emptyFolder') }}
        </div>
      </div>
    </div>

    <DirDirectFiles
      :audio="directAudioHere"
      :images="directImagesHere"
      :audio-limit="audioDisplayLimit"
      :image-limit="imageDisplayLimit"
      :get-thumb="getThumb"
      @open-image="openImageViewer"
      @edit="previewEdit"
      @more-audio="audioDisplayLimit += 50"
      @more-images="imageDisplayLimit += 24"
    />
  </div>
</template>
