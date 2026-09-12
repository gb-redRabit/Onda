<script setup lang="ts">
import { watch } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import MediaCover from '@renderer/components/MediaCover.vue';
import { Folder } from '@lucide/vue';
import { useThumbnails } from '@renderer/composables/useThumbnails';

const props = defineProps<{
  tracks: MediaFile[];
}>();

const displayTracks = () => props.tracks.slice(0, 4);
const { request, getThumb } = useThumbnails(64);
watch(
  () => props.tracks.map((t) => t.path).join('|'),
  () => {
    const vids = props.tracks.filter((t) => t.type === 'image' || t.type === 'video').slice(0, 4);
    if (vids.length) request(vids.map((p) => p.path));
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="w-12 h-12 rounded-field overflow-hidden bg-base-200 border border-base-300 shrink-0 grid grid-cols-2 grid-rows-2 gap-px"
  >
    <div
      v-for="tr in displayTracks()"
      :key="tr.path"
      class="bg-base-300 overflow-hidden flex items-center justify-center"
    >
      <img
        v-if="tr.type === 'image' || tr.type === 'video'"
        :src="getThumb(tr.path) || ''"
        class="w-full h-full object-cover"
        loading="lazy"
      />
      <MediaCover
        v-else
        :path="tr.path"
        :size="20"
        :autoplay="false"
        :render-as-video="false"
        fallback="music"
      />
    </div>
    <div
      v-for="n in Math.max(0, 4 - displayTracks().length)"
      :key="'empty-' + n"
      class="bg-base-300 flex items-center justify-center"
    >
      <Folder :size="10" class="text-base-content/20" />
    </div>
  </div>
</template>
