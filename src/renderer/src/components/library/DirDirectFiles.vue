<script setup lang="ts">
import type { MediaFile } from '@renderer/types/media';
import { useI18n } from 'vue-i18n';
import { useLibraryContextMenu } from '@renderer/composables/useLibraryContextMenu';
import LibraryTrackRow from './LibraryTrackRow.vue';

const { t: translate } = useI18n();

const props = defineProps<{
  audio: MediaFile[];
  images: MediaFile[];
  audioLimit: number;
  imageLimit: number;
  getThumb: (path: string) => string | undefined;
}>();

const emit = defineEmits<{
  'open-image': [path: string];
  edit: [track: MediaFile];
  'more-audio': [];
  'more-images': [];
}>();

const { showImageMenu } = useLibraryContextMenu();
</script>

<template>
  <div v-if="props.audio.length > 0" class="divide-y divide-hairline/30">
    <LibraryTrackRow
      v-for="t in props.audio.slice(0, props.audioLimit)"
      :key="t.path"
      :track="t"
      :show-playlist="true"
      @edit="emit('edit', $event)"
    />
    <button
      v-if="props.audio.length > props.audioLimit"
      type="button"
      class="w-full py-2 text-xs text-primary-text hover:bg-primary/10 transition-colors border-t border-hairline/30"
      @click="emit('more-audio')"
    >
      {{
        translate('library.showMoreAudio', {
          remaining: props.audio.length - props.audioLimit,
          total: props.audio.length
        })
      }}
    </button>
  </div>
  <div v-if="props.images.length > 0" class="grid grid-cols-4 sm:grid-cols-6 gap-2 p-3">
    <button
      v-for="img in props.images.slice(0, props.imageLimit)"
      :key="img.path"
      type="button"
      class="aspect-square rounded-field overflow-hidden bg-base-200 border border-hairline hover:border-primary/30 transition-colors group"
      @click="emit('open-image', img.path)"
      @contextmenu.prevent="showImageMenu($event, img, () => emit('open-image', img.path))"
    >
      <img
        :src="props.getThumb(img.path) || ''"
        :alt="img.name"
        class="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
        loading="lazy"
      />
    </button>
    <button
      v-if="props.images.length > props.imageLimit"
      type="button"
      class="col-span-full py-2 text-xs text-primary-text hover:bg-primary/10 rounded-field transition-colors"
      @click="emit('more-images')"
    >
      {{
        translate('library.showMoreImages', { remaining: props.images.length - props.imageLimit })
      }}
    </button>
  </div>
</template>
