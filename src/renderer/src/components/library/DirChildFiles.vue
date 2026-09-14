<script setup lang="ts">
import type { MediaFile } from '@renderer/types/media';
import type { DirChildMeta } from '@renderer/utils/dirNode';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import LibraryTrackRow from './LibraryTrackRow.vue';

defineProps<{
  meta: DirChildMeta;
  childName: string;
  getThumb: (path: string) => string | undefined;
}>();

const emit = defineEmits<{
  'open-image': [childName: string, imagePath: string];
  edit: [track: MediaFile];
}>();

const { showImageMenu } = useLibraryContextMenu();
</script>

<template>
  <div v-if="meta.directAll.length > 0">
    <div v-if="meta.directImages.length > 0" class="grid grid-cols-4 gap-2 p-3">
      <button
        v-for="img in meta.directImages.slice(0, 24)"
        :key="img.path"
        class="aspect-square rounded-field overflow-hidden bg-base-200 border border-base-300 hover:border-primary/30 transition-colors"
        @click="emit('open-image', childName, img.path)"
        @contextmenu.prevent="
          showImageMenu($event, img, () => emit('open-image', childName, img.path))
        "
      >
        <img :src="getThumb(img.path) || ''" class="w-full h-full object-cover" loading="lazy" />
      </button>
    </div>
    <div v-if="meta.directAudio.length > 0" class="divide-y divide-base-300/30">
      <LibraryTrackRow
        v-for="t in meta.directAudio.slice(0, 50)"
        :key="t.path"
        :track="t"
        :show-playlist="true"
        @edit="emit('edit', $event)"
      />
      <button
        v-if="meta.directAudio.length > 50"
        class="w-full py-2 text-xs text-primary hover:bg-primary/10 transition-colors"
        @click="() => {}"
      >
        Pokazano 50 z {{ meta.directAudio.length }} — użyj wyszukiwarki aby zawęzić
      </button>
    </div>
  </div>
</template>
