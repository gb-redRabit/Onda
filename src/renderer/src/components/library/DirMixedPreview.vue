<script setup lang="ts">
import type { MediaFile } from '@renderer/types/media';
import type { DirChildMeta } from '@renderer/utils/dirNode';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import LibraryFolderTile from './LibraryFolderTile.vue';
import MediaCover from '@renderer/components/MediaCover.vue';

defineProps<{
  folders: string[];
  files: MediaFile[];
  meta: Record<string, DirChildMeta>;
  getThumb: (path: string) => string | undefined;
}>();

const emit = defineEmits<{
  toggle: [path: string];
  play: [path: string];
  'open-image': [path: string];
  edit: [track: MediaFile];
}>();

const { showImageMenu, showTrackMenu } = useLibraryContextMenu();

function folderTracksFor(name: string, meta: Record<string, DirChildMeta>) {
  return (meta[name]?.audio ?? []).slice(0, 4);
}
</script>

<template>
  <!-- mieszany podgląd: foldery + okładki (max 3 foldery) -->
  <div class="p-3 grid grid-cols-4 gap-3 bg-base-100/40 border-b border-base-300/30">
    <button
      v-for="sub in folders"
      :key="'prev-f-' + sub"
      class="flex flex-col items-center gap-2 p-3 rounded-box bg-base-100 border border-base-300 hover:border-primary/30 hover:bg-base-200/50 transition-colors text-center"
      @click="emit('toggle', sub)"
    >
      <LibraryFolderTile :tracks="folderTracksFor(sub, meta)" />
      <span class="text-xs font-medium truncate w-full">{{ sub }}</span>
      <span class="text-[11px] text-base-content/50">{{ meta[sub]?.audioCount ?? 0 }} plików</span>
    </button>
    <button
      v-for="tr in files"
      :key="'prev-t-' + tr.path"
      class="rounded-box overflow-hidden bg-base-100 border border-base-300 hover:border-primary/30 hover:shadow-sm transition-all group text-left"
      @click="tr.type === 'image' ? emit('open-image', tr.path) : emit('play', tr.path)"
      @dblclick="tr.type === 'image' ? emit('open-image', tr.path) : emit('play', tr.path)"
      @contextmenu.prevent="
        tr.type === 'image'
          ? showImageMenu($event, tr, () => emit('open-image', tr.path))
          : showTrackMenu($event, tr, { onEdit: () => emit('edit', tr) })
      "
    >
      <div class="aspect-square bg-base-200 overflow-hidden flex items-center justify-center">
        <img
          v-if="tr.type === 'image' || tr.type === 'video'"
          :src="getThumb(tr.path) || ''"
          class="w-full h-full object-cover"
          loading="lazy"
        />
        <MediaCover v-else :path="tr.path" :size="80" :autoplay="false" fallback="music" />
      </div>
      <div class="p-2">
        <div class="text-xs font-medium truncate">{{ tr.metadata?.title || tr.name }}</div>
        <div class="text-[11px] text-base-content/50 truncate">
          {{ tr.type === 'image' ? tr.extension : tr.metadata?.artist || '' }}
        </div>
      </div>
    </button>
  </div>
</template>
