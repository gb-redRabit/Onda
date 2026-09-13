<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronLeft, ChevronRight, Radio, RefreshCw } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { isScItem } from '@renderer/utils/onlineView';
import OnlineButton from './OnlineButton.vue';
import OnlineEmptyState from './OnlineEmptyState.vue';
import OnlineMediaCard from './OnlineMediaCard.vue';
import LoaderSpinner from '@renderer/components/LoaderSpinner.vue';
import type { YouTubeVideo } from '@renderer/types/online';

const expandedId = defineModel<string | null>('expandedId', { required: true });
const emit = defineEmits<{
  quickQueue: [YouTubeVideo];
  options: [YouTubeVideo];
  openWindow: [string];
}>();

const yt = useOnlineStore();
const { t } = useI18n();

const pageTotal = computed(() => Math.ceil(yt.searchResults.length / 20));

function watchUrl(item: { id: string; url?: string }): string {
  return yt.itemUrl(item);
}

function platformTagFor(item: { id: string; url?: string }): 'YT' | 'SC' {
  return isScItem(item, yt.itemUrl(item)) ? 'SC' : 'YT';
}

function itemDownloadState(videoId: string): 'queuing' | 'downloading' | 'done' | null {
  if (yt.queuingId === videoId) return 'queuing';
  const status = yt.downloadStatusFor(videoId);
  if (status === 'downloading' || status === 'pending' || status === 'paused') {
    return 'downloading';
  }
  if (status === 'completed' && yt.coverStatusFor(videoId) === 'fetching') {
    return 'downloading';
  }
  if (status === 'completed') return 'done';
  return null;
}
</script>

<template>
  <LoaderSpinner v-if="yt.isSearching" />

  <OnlineEmptyState
    v-else-if="yt.searchResults.length === 0 && !yt.resolved"
    :icon="Radio"
    :title="t('youtube.searchHeadingOnline')"
    :description="t('youtube.discover')"
  />

  <div v-else-if="yt.searchResults.length" class="space-y-4">
    <p class="text-xs text-base-content/50 px-1">
      {{ t('youtube.resultsCount', { count: yt.searchResults.length }) }}
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <OnlineMediaCard
        v-for="v in yt.pagedResults"
        :key="v.id"
        :video="v"
        :expanded="expandedId === v.id"
        :state="itemDownloadState(v.id)"
        :cover-status="yt.coverStatusFor(v.id)"
        :watch-url="watchUrl(v)"
        :platform-tag="platformTagFor(v)"
        show-channel
        show-views
        show-description
        @expand="expandedId = v.id"
        @collapse="expandedId = null"
        @queue="emit('quickQueue', v)"
        @play="yt.playStream(v)"
        @options="emit('options', v)"
        @open-window="emit('openWindow', watchUrl(v))"
      />
    </div>

    <div v-if="pageTotal > 1" class="flex items-center justify-center gap-3 pt-2">
      <OnlineButton
        variant="secondary"
        size="sm"
        :disabled="!yt.hasPrevPage"
        @click="yt.prevSearchPage"
      >
        <ChevronLeft :size="16" />
      </OnlineButton>
      <span class="text-xs text-base-content/50">
        {{ t('youtube.pageOf', { current: yt.searchPage + 1, total: pageTotal }) }}
      </span>
      <OnlineButton
        variant="secondary"
        size="sm"
        :disabled="!yt.hasNextPage"
        @click="yt.nextSearchPage"
      >
        <ChevronRight :size="16" />
      </OnlineButton>
    </div>

    <div v-if="!yt.hasNextPage && yt.hasMoreSc" class="flex items-center justify-center pt-2">
      <OnlineButton
        variant="secondary"
        size="sm"
        :disabled="yt.searchLoadingMore"
        @click="yt.loadMoreSearch"
      >
        <RefreshCw v-if="yt.searchLoadingMore" :size="12" class="animate-spin" />
        <ChevronRight v-else :size="14" />
        {{ t('youtube.loadMore') }}
      </OnlineButton>
    </div>
  </div>
</template>
