<script setup lang="ts">
import { computed } from 'vue';
import { Download, X } from '@lucide/vue';
import YTButton from './YTButton.vue';
import YTBadge from './YTBadge.vue';
import type { YouTubeResolveKind } from '@renderer/types/youtube';

const props = defineProps<{
  kind: YouTubeResolveKind;
  title: string;
  channelTitle?: string;
  totalItems?: number | null;
  loadedCount?: number;
  loading?: boolean;
  canDownloadAll?: boolean;
}>();

const emit = defineEmits<{
  downloadAll: [];
  clear: [];
}>();

const kindMeta = computed(() => {
  switch (props.kind) {
    case 'playlist':
      return { key: 'youtube.kindPlaylist', variant: 'amber' as const };
    case 'channel':
      return { key: 'youtube.kindChannel', variant: 'green' as const };
    default:
      return { key: 'youtube.kindVideo', variant: 'accent' as const };
  }
});
</script>

<template>
  <div class="flex items-center gap-3 p-3 rounded-2xl bg-bg-surface border border-border-default">
    <YTBadge :variant="kindMeta.variant" size="md">{{ $t(kindMeta.key) }}</YTBadge>
    <div class="min-w-0 flex-1">
      <h2 class="text-sm font-semibold text-fg-base truncate">{{ title }}</h2>
      <p class="text-xs text-fg-muted truncate">
        <span v-if="channelTitle">{{ channelTitle }}</span>
        <span v-if="channelTitle && totalItems != null"> · </span>
        <span v-if="totalItems != null">
          {{ $t('youtube.itemsCount', { count: totalItems }) }}
        </span>
        <span v-else-if="loadedCount != null">
          {{ $t('youtube.itemsCount', { count: loadedCount }) }}
        </span>
      </p>
    </div>
    <div v-if="loading" class="flex items-center gap-2 shrink-0">
      <div
        class="w-4 h-4 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
      />
      <span v-if="totalItems != null" class="text-xs text-fg-faint">
        {{ loadedCount }} / {{ totalItems }}
      </span>
    </div>
    <YTButton v-if="canDownloadAll" variant="primary" size="sm" @click="emit('downloadAll')">
      <Download :size="12" />
      {{ $t('youtube.downloadAll') }}
    </YTButton>
    <YTButton variant="secondary" size="sm" @click="emit('clear')">
      <X :size="12" />
      {{ $t('youtube.clear') }}
    </YTButton>
  </div>
</template>
