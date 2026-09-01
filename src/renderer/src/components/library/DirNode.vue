<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { ChevronDown, Folder, Play, ExternalLink } from '@lucide/vue';
import { canonicalPath, isUnderPath, dirname } from '@renderer/utils/path';
import { formatDuration } from '@renderer/utils/formatters';
import type { MediaFile } from '@renderer/types/media';
import { getChildDirsIndexed, getDirectTracksIndexed, getAllTracksIndexed } from '@renderer/utils/libraryIndex';
import LibraryTrackRow from './LibraryTrackRow.vue';
import LibraryFolderTile from './LibraryFolderTile.vue';
import MediaCover from '@renderer/components/MediaCover.vue';
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
const { showFolderMenu, showImageMenu, showTrackMenu } = useLibraryContextMenu();
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

function tracksInChild(name: string) {
  const child = childCanonical(name);
  return getAllTracksIndexed(child, library.tracks, library.folders);
}
function directTracksInDir(dir: string) {
  const q = props.query.toLowerCase().trim();
  const all = getDirectTracksIndexed(dir, library.tracks, library.folders);
  if (!q) return all;
  return all.filter((t) => t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q));
}
function directTracksForChild(name: string) {
  return directTracksInDir(childOriginal(name));
}
const directHere = computed(() => directTracksInDir(props.dir));
const directAudioHere = computed(() => directHere.value.filter((t) => t.type !== 'image'));
const directImagesHere = computed(() => directHere.value.filter((t) => t.type === 'image'));

const audioDisplayLimit = ref(50);
const imageDisplayLimit = ref(24);
watch(
  () => props.query + '|' + directHere.value.length,
  () => {
    audioDisplayLimit.value = 50;
    imageDisplayLimit.value = 24;
  }
);
const displayedAudio = computed(() => directAudioHere.value.slice(0, audioDisplayLimit.value));
const displayedImages = computed(() => directImagesHere.value.slice(0, imageDisplayLimit.value));

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
  () => displayedImages.value.map((p) => p.path).join('|'),
  () => {
    if (displayedImages.value.length) requestThumb(displayedImages.value.map((p) => p.path));
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
  return tracksInChild(name).filter((t) => t.type !== 'image').slice(0, 4);
}
function onFolderDrag(e: DragEvent, folderPath: string) {
  const tracks = getAllTracksIndexed(folderPath, library.tracks, library.folders).filter((t) => t.type !== 'image');
  e.dataTransfer?.setData('text/plain', JSON.stringify({ paths: tracks.map((t) => t.path) }));
  e.dataTransfer!.effectAllowed = 'move';
}
function playDir(fp: string) {
  const tracks = library.tracks.filter((t) => isUnderPath(t.path, fp) && t.type !== 'image' && (!props.query || t.name.toLowerCase().includes(props.query.toLowerCase().trim()) || t.path.toLowerCase().includes(props.query.toLowerCase().trim())));
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
  const imgs = library.tracks.filter((t) => t.type === 'image' && canonicalPath(dirname(t.path)) === canonicalPath(childDir));
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
  <div v-if="isMixed" class="p-3 grid grid-cols-4 gap-3 bg-base-100/40 border-b border-base-300/30">
    <button
      v-for="sub in previewFolders"
      :key="'prev-f-' + sub"
      class="flex flex-col items-center gap-2 p-3 rounded-box bg-base-100 border border-base-300 hover:border-primary/30 hover:bg-base-200/50 transition-colors text-center"
      @click="emit('toggle', childOriginal(sub))"
    >
      <LibraryFolderTile :tracks="folderTracksFor(sub)" />
      <span class="text-xs font-medium truncate w-full">{{ sub }}</span>
      <span class="text-[11px] text-base-content/50">{{ tracksInChild(sub).filter((t) => t.type !== 'image').length }} plików</span>
    </button>
      <button
        v-for="tr in previewFiles"
        :key="'prev-t-' + tr.path"
        class="rounded-box overflow-hidden bg-base-100 border border-base-300 hover:border-primary/30 hover:shadow-sm transition-all group text-left"
        @click="tr.type === 'image' ? openImageViewer(tr.path) : playDir(tr.path)"
        @dblclick="tr.type === 'image' ? openImageViewer(tr.path) : playDir(tr.path)"
        @contextmenu.prevent="tr.type === 'image' ? showImageMenu($event, tr, () => openImageViewer(tr.path)) : showTrackMenu($event, tr, { onEdit: () => emit('edit', tr) })"
      >
      <div class="aspect-square bg-base-200 overflow-hidden flex items-center justify-center">
        <img v-if="tr.type === 'image' || tr.type === 'video'" :src="getThumb(tr.path) || ''" class="w-full h-full object-cover" loading="lazy" />
        <MediaCover v-else :path="tr.path" :size="80" :autoplay="false" fallback="music" />
      </div>
      <div class="p-2">
        <div class="text-xs font-medium truncate">{{ tr.metadata?.title || tr.name }}</div>
        <div class="text-[11px] text-base-content/50 truncate">{{ tr.type === 'image' ? tr.extension : (tr.metadata?.artist || '') }}</div>
      </div>
    </button>
  </div>

  <div class="divide-y divide-base-300/50">
    <div v-for="sub in childDirNames" :key="sub">
      <div
        class="group/row flex items-center gap-2 py-2 pr-3 text-xs hover:bg-base-100/60 transition-colors"
        :style="{ paddingLeft: 16 + depth * 16 + 'px' }"
        draggable="true"
        @dragstart="onFolderDrag($event, childOriginal(sub))"
      >
        <button class="flex items-center gap-2 flex-1 min-w-0 text-left" @click="emit('toggle', childOriginal(sub))" @contextmenu.prevent="showFolderMenu($event, childOriginal(sub), tracksInChild(sub))">
          <ChevronDown
            :size="12"
            class="transition-transform duration-150 shrink-0 text-base-content/40"
            :class="isExpanded(childOriginal(sub)) ? '' : '-rotate-90'"
          />
          <LibraryFolderTile :tracks="folderTracksFor(sub)" class="w-8 h-8 !rounded-field shrink-0 hidden sm:grid" />
          <Folder :size="13" class="shrink-0 text-primary/70 sm:hidden" />
          <span class="font-medium truncate text-base-content/80 group-hover/row:text-base-content">{{ sub }}</span>
          <span class="ml-auto text-[11px] px-1.5 py-0.5 rounded-full bg-base-100 border border-base-300 text-base-content/60 shrink-0">
            {{ tracksInChild(sub).filter((t) => t.type !== 'image').length }}
          </span>
          <span
            v-if="tracksInChild(sub).reduce((s, t) => s + (t.duration || 0), 0) > 0"
            class="text-[11px] text-base-content/40 hidden sm:inline"
          >
            {{ formatDuration(tracksInChild(sub).reduce((s, t) => s + (t.duration || 0), 0), '') }}
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
        <div v-if="directTracksForChild(sub).length > 0">
          <div v-if="directTracksForChild(sub).some((t) => t.type === 'image')" class="grid grid-cols-4 gap-2 p-3">
            <button
              v-for="img in directTracksForChild(sub).filter((t) => t.type === 'image').slice(0, 24)"
              :key="img.path"
              class="aspect-square rounded-field overflow-hidden bg-base-200 border border-base-300 hover:border-primary/30 transition-colors"
              @click="openImageViewerForChild(sub, img.path)"
              @contextmenu.prevent="showImageMenu($event, img, () => openImageViewerForChild(sub, img.path))"
            >
              <img :src="getThumb(img.path) || ''" class="w-full h-full object-cover" loading="lazy" />
            </button>
          </div>
          <div v-if="directTracksForChild(sub).some((t) => t.type !== 'image')" class="divide-y divide-base-300/30">
            <LibraryTrackRow
              v-for="t in directTracksForChild(sub).filter((t) => t.type !== 'image').slice(0, 50)"
              :key="t.path"
              :track="t"
              :show-playlist="true"
              @edit="emit('edit', $event)"
            />
            <button
              v-if="directTracksForChild(sub).filter((t) => t.type !== 'image').length > 50"
              class="w-full py-2 text-xs text-primary hover:bg-primary/10 transition-colors"
              @click="() => {}"
            >
              Pokazano 50 z {{ directTracksForChild(sub).filter((t) => t.type !== 'image').length }} — użyj wyszukiwarki aby zawęzić
            </button>
          </div>
        </div>
        <div v-else-if="childDirNames.length === 0 && directHere.length === 0" class="px-4 py-2 text-xs text-base-content/40 italic" :style="{ paddingLeft: 16 + (depth + 1) * 16 + 'px' }">
          {{ $t('library.emptyFolder') }}
        </div>
      </div>
    </div>

    <div v-if="directAudioHere.length > 0" class="divide-y divide-base-300/30">
      <LibraryTrackRow
        v-for="t in displayedAudio"
        :key="t.path"
        :track="t"
        :show-playlist="true"
        @edit="emit('edit', $event)"
      />
      <button
        v-if="directAudioHere.length > displayedAudio.length"
        class="w-full py-2 text-xs text-primary hover:bg-primary/10 transition-colors border-t border-base-300/30"
        @click="audioDisplayLimit += 50"
      >
        Pokaż więcej ({{ directAudioHere.length - displayedAudio.length }} z {{ directAudioHere.length }})
      </button>
    </div>
    <div v-if="directImagesHere.length > 0" class="grid grid-cols-4 sm:grid-cols-6 gap-2 p-3">
      <button
        v-for="img in displayedImages"
        :key="img.path"
        class="aspect-square rounded-field overflow-hidden bg-base-200 border border-base-300 hover:border-primary/30 transition-colors group"
        @click="openImageViewer(img.path)"
        @contextmenu.prevent="showImageMenu($event, img, () => openImageViewer(img.path))"
      >
        <img :src="getThumb(img.path) || ''" :alt="img.name" class="w-full h-full object-cover hover:scale-105 transition-transform duration-200" loading="lazy" />
      </button>
      <button
        v-if="directImagesHere.length > displayedImages.length"
        class="col-span-full py-2 text-xs text-primary hover:bg-primary/10 rounded-field transition-colors"
        @click="imageDisplayLimit += 24"
      >
        Pokaż więcej obrazów ({{ directImagesHere.length - displayedImages.length }})
      </button>
    </div>
  </div>
</template>
