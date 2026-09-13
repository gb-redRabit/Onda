<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RefreshCw } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import OnlineButton from './OnlineButton.vue';
import OnlineMediaCard from './OnlineMediaCard.vue';
import OnlineSourceHeader from './OnlineSourceHeader.vue';
import OnlineSelectionToolbar from './OnlineSelectionToolbar.vue';
import type { YouTubeResolvedItem } from '@renderer/types/online';

defineProps<{
  resolvedLoading: boolean;
  resolvedCapped: boolean;
  selectedCount: number;
  saved: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  toggleSelect: [string];
  quickQueue: [YouTubeResolvedItem];
  options: [YouTubeResolvedItem];
  openWindow: [string];
  downloadAll: [];
  playAll: [];
  save: [];
  clear: [];
  selectAll: [];
  selectRange: [];
  addSelected: [];
  loadMore: [];
}>();

const expandedId = defineModel<string | null>('expandedId', { required: true });
const rangeStart = defineModel<number>('rangeStart', { required: true });
const rangeEnd = defineModel<number>('rangeEnd', { required: true });

const yt = useOnlineStore();
const { t } = useI18n();

function watchUrl(item: { id: string; url?: string }): string {
  return yt.itemUrl(item);
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
  <div v-if="yt.resolved" class="mb-8 space-y-4">
    <OnlineSourceHeader
      :kind="yt.resolved.kind"
      :title="yt.resolved.title"
      :channel-title="yt.resolved.meta.channelTitle"
      :total-items="yt.resolved.meta.totalItems"
      :loaded-count="yt.resolved.items.length"
      :loading="resolvedLoading"
      :can-download-all="yt.resolved.kind !== 'video'"
      :can-play-all="yt.resolved.kind !== 'video'"
      :can-save="yt.resolved.kind !== 'video'"
      :saved="saved"
      :saving="saving"
      @download-all="emit('downloadAll')"
      @play-all="emit('playAll')"
      @save="emit('save')"
      @clear="emit('clear')"
    />

    <div
      v-if="yt.resolved.items.length === 0"
      class="text-sm text-base-content/50 py-8 text-center"
    >
      {{ t('youtube.itemsCount', { count: 0 }) }}
    </div>

    <div v-else class="space-y-4">
      <div
        class="grid gap-4"
        :class="[
          yt.resolved.kind === 'video'
            ? 'grid-cols-1'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        ]"
      >
        <OnlineMediaCard
          v-for="item in yt.resolved.items"
          :key="item.id"
          :video="item"
          :expanded="expandedId === item.id"
          :selectable="yt.resolved.kind !== 'video'"
          :selected="yt.selectedResolved.has(item.id)"
          :state="itemDownloadState(item.id)"
          :cover-status="yt.coverStatusFor(item.id)"
          :watch-url="watchUrl(item)"
          @expand="expandedId = item.id"
          @collapse="expandedId = null"
          @toggle-select="emit('toggleSelect', $event)"
          @queue="emit('quickQueue', item)"
          @play="yt.playStream(item)"
          @options="emit('options', item)"
          @open-window="emit('openWindow', watchUrl(item))"
        />
      </div>

      <OnlineSelectionToolbar
        v-if="yt.resolved.kind !== 'video'"
        :selected-count="selectedCount"
        :total-count="yt.resolved.items.length"
        :range-start="rangeStart"
        :range-end="rangeEnd"
        @update:range-start="rangeStart = $event"
        @update:range-end="rangeEnd = $event"
        @select-all="emit('selectAll')"
        @select-range="emit('selectRange')"
        @add-selected="emit('addSelected')"
      />

      <div v-if="resolvedCapped" class="flex justify-center">
        <OnlineButton
          variant="secondary"
          size="sm"
          :disabled="resolvedLoading"
          @click="emit('loadMore')"
        >
          <RefreshCw v-if="resolvedLoading" :size="12" class="animate-spin" />
          {{ t('youtube.loadMore') }}
        </OnlineButton>
      </div>
    </div>
  </div>
</template>
