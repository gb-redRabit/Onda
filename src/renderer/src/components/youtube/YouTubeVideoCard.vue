<script setup lang="ts">
import { Play, Download } from '@lucide/vue';
import { formatNumber } from '@renderer/utils/formatters';
import type { YouTubeVideo } from '@renderer/types/youtube';

const props = defineProps<{
  video: YouTubeVideo;
  short?: boolean;
}>();

const emit = defineEmits<{ queue: [video: YouTubeVideo] }>();
</script>

<template>
  <div class="group cursor-pointer">
    <div
      class="relative rounded-xl overflow-hidden bg-bg-elevated"
      :class="short ? 'aspect-[9/16]' : 'aspect-video'"
    >
      <img
        v-if="props.video.thumbnail"
        :src="props.video.thumbnail"
        :alt="props.video.title"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <div
        v-if="props.video.duration"
        class="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded"
      >
        {{ props.video.duration }}
      </div>
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
      >
        <div class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Play :size="short ? 28 : 36" class="text-white drop-shadow" fill="white" />
        </div>
      </div>
      <button
        class="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] hover:bg-black/90"
        :title="$t('youtube.addToQueue')"
        @click.stop="emit('queue', props.video)"
      >
        <Download :size="11" />
      </button>
    </div>
    <div class="mt-2">
      <h3 class="text-sm font-medium line-clamp-2">{{ props.video.title }}</h3>
      <p class="text-xs text-fg-faint mt-0.5 truncate">
        <span v-if="props.video.viewCount">{{ formatNumber(props.video.viewCount) }}</span>
        <span v-if="props.video.viewCount"> {{ $t('youtube.views') }}</span>
      </p>
    </div>
  </div>
</template>
