<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronLeft, ChevronRight, Radio, RefreshCw } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { isScItem } from '@renderer/utils/onlineView';
import OnlineButton from './OnlineButton.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import OnlineMediaCard from './OnlineMediaCard.vue';
import Loader from '@renderer/components/layout/Loader.vue';
import type { YouTubeVideo } from '@renderer/types/online';

const expandedId = defineModel<string | null>('expandedId', { required: true });
const emit = defineEmits<{
  quickQueue: [YouTubeVideo];
  options: [YouTubeVideo];
  openWindow: [string];
  openChannel: [string];
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
  if (yt.isQueuing(videoId)) return 'queuing';
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
  <Loader v-if="yt.isSearching" overlay :label="$t('common.loading')" />

  <EmptyState
    v-else-if="yt.searchResults.length === 0 && !yt.resolved"
    variant="plain"
    :icon="Radio"
    :title="t('youtube.searchHeadingOnline')"
    :description="t('youtube.discover')"
  />

  <div v-else-if="yt.searchResults.length" class="space-y-4">
    <div class="flex items-center justify-between gap-2 px-1">
      <p class="min-w-0 truncate text-xs text-base-content/50">
        {{ t('youtube.resultsLabel') }}: {{ yt.searchResults.length }}
        <template v-if="yt.searchQuery.trim()">
          · {{ t('youtube.resultsFor', { query: yt.searchQuery.trim() }) }}
        </template>
      </p>
      <button
        type="button"
        data-testid="online-clear-results"
        class="shrink-0 text-xs text-base-content/60 transition-colors hover:text-base-content"
        @click="yt.clearSearch()"
      >
        {{ t('common.clear') }}
      </button>
    </div>
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
        @open-channel="emit('openChannel', $event)"
      />
    </div>

    <div v-if="pageTotal > 1" class="flex items-center justify-center gap-3 pt-2">
      <OnlineButton
        variant="secondary"
        size="sm"
        :disabled="!yt.hasPrevPage"
        :aria-label="t('common.previous')"
        :title="t('common.previous')"
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
        :aria-label="t('common.next')"
        :title="t('common.next')"
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
