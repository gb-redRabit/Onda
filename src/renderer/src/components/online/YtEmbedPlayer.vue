<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink, X } from '@lucide/vue';

const props = defineProps<{
  videoId: string;
  title?: string;
  channelTitle?: string;
  sourceUrl?: string;
}>();

const emit = defineEmits<{
  close: [];
  openWindow: [url: string];
}>();

const embedUrl = computed(
  () =>
    `https://www.youtube.com/embed/${encodeURIComponent(props.videoId)}?autoplay=1&playsinline=1&rel=0`
);

function openInWindow() {
  if (props.sourceUrl) emit('openWindow', props.sourceUrl);
}
</script>

<template>
  <div class="w-full">
    <div class="relative aspect-video rounded-xl overflow-hidden bg-black">
      <iframe
        :src="embedUrl"
        class="absolute inset-0 w-full h-full"
        :title="title || videoId"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
      />
    </div>
    <div v-if="title" class="flex items-center gap-2 mt-1.5 min-w-0">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium truncate">{{ title }}</p>
        <p v-if="channelTitle" class="text-xs text-fg-faint truncate">{{ channelTitle }}</p>
      </div>
      <button
        class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors shrink-0"
        :title="$t('youtube.openInWindow')"
        @click="openInWindow"
      >
        <ExternalLink :size="13" />
      </button>
      <button
        class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors shrink-0"
        :title="$t('nav.collapse')"
        @click="emit('close')"
      >
        <X :size="13" />
      </button>
    </div>
  </div>
</template>
