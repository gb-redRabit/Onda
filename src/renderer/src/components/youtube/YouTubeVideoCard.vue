<script setup lang="ts">
import { computed } from 'vue';
import { Check, Play, Download, RefreshCw } from '@lucide/vue';
import { formatNumber } from '@renderer/utils/formatters';
import { useYouTubeStore } from '@renderer/stores/youtube';
import type { YouTubeVideo } from '@renderer/types/youtube';
import YouTubeEmbedPlayer from './YouTubeEmbedPlayer.vue';

const props = defineProps<{
  video: YouTubeVideo;
  short?: boolean;
  downloaded?: boolean;
  coverStatus?: 'none' | 'fetching' | 'embedded' | 'saved' | 'error' | null;
  expanded?: boolean;
  watchUrl?: string;
}>();

const emit = defineEmits<{
  queue: [video: YouTubeVideo];
  expand: [video: YouTubeVideo];
  collapse: [];
}>();

const yt = useYouTubeStore();

const state = computed<'queuing' | 'downloading' | 'done' | null>(() => {
  if (yt.queuingId === props.video.id) return 'queuing';
  const status = yt.downloadStatusFor(props.video.id);
  if (status === 'downloading' || status === 'pending' || status === 'paused') {
    return 'downloading';
  }
  if (status === 'completed') return 'done';
  return null;
});

function openInWindow() {
  const url = props.watchUrl || `https://www.youtube.com/watch?v=${props.video.id}`;
  window.open(url, '_blank', 'width=1100,height=700');
}
</script>

<template>
  <div class="group cursor-pointer">
    <YouTubeEmbedPlayer
      v-if="expanded"
      :video-id="props.video.id"
      :title="props.video.title"
      :channel-title="props.video.channelTitle"
      :source-url="watchUrl || `https://www.youtube.com/watch?v=${props.video.id}`"
      @close="emit('collapse')"
      @open-window="openInWindow"
    />
    <div
      v-else
      class="relative rounded-xl overflow-hidden bg-bg-elevated"
      :class="short ? 'aspect-9/16' : 'aspect-video'"
    >
      <img
        v-if="props.video.thumbnail"
        :src="props.video.thumbnail"
        :alt="props.video.title"
        loading="lazy"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <div
        v-if="props.downloaded && props.coverStatus !== 'fetching'"
        class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-base text-white text-[10px] font-medium"
        :title="$t('youtube.downloaded')"
      >
        <Check :size="10" />
      </div>
      <div
        v-if="props.coverStatus === 'fetching'"
        class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-base text-white text-[10px] font-medium"
        :title="$t('downloads.coverStatusFetching')"
      >
        <RefreshCw :size="10" class="animate-spin" />
      </div>
      <div
        v-if="props.video.duration"
        class="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded"
      >
        {{ props.video.duration }}
      </div>
      <button
        class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
        :title="$t('youtube.play')"
        @click.stop="emit('expand', props.video)"
      >
        <div class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Play :size="short ? 28 : 36" class="text-white drop-shadow" fill="white" />
        </div>
      </button>
      <button
        class="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] hover:bg-black/90 disabled:opacity-60"
        :title="$t('youtube.addToQueue')"
        :disabled="state !== null"
        @click.stop="emit('queue', props.video)"
      >
        <RefreshCw
          v-if="state === 'queuing' || state === 'downloading'"
          :size="11"
          class="animate-spin"
        />
        <Check v-else-if="state === 'done'" :size="11" />
        <Download v-else :size="11" />
      </button>
    </div>
    <div v-if="!expanded" class="mt-2">
      <h3 class="text-sm font-medium line-clamp-2">{{ props.video.title }}</h3>
      <p class="text-xs text-fg-faint mt-0.5 truncate">
        <span v-if="props.video.viewCount">{{ formatNumber(props.video.viewCount) }}</span>
        <span v-if="props.video.viewCount"> {{ $t('youtube.views') }}</span>
      </p>
    </div>
  </div>
</template>
