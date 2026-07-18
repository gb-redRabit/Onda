<script setup lang="ts">
import { ArrowLeft, Maximize2, PictureInPicture } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';

defineProps<{
  showControls: boolean;
  track: MediaFile | null;
}>();

const emit = defineEmits<{
  back: [];
  pip: [];
  fullscreen: [];
}>();
</script>

<template>
  <div
    class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-linear-to-b from-black/80 to-transparent transition-opacity"
    :class="{ 'opacity-0': !showControls }"
  >
    <button
      class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
      @click="emit('back')"
    >
      <ArrowLeft :size="20" />
    </button>
    <div class="text-center flex-1">
      <p class="text-white text-sm font-medium truncate">
        {{ track?.metadata?.title || track?.name || 'Brak wideo' }}
      </p>
      <p class="text-white/50 text-xs">{{ track?.metadata?.artist || '' }}</p>
    </div>
    <button
      class="p-2 rounded-xl bg-white/10 mr-2 hover:bg-white/20 text-white transition-colors"
      @click="emit('pip')"
    >
      <PictureInPicture :size="18" />
    </button>
    <button
      class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
      @click="emit('fullscreen')"
    >
      <Maximize2 :size="18" />
    </button>
  </div>
</template>
