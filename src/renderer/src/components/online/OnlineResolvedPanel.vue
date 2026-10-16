<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RefreshCw } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import OnlineButton from './OnlineButton.vue';
import OnlineMediaCard from './OnlineMediaCard.vue';
import OnlineMediaGrid from './OnlineMediaGrid.vue';
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
  openChannel: [string];
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
  <div v-if="yt.resolved" class="flex h-full flex-col">
    <OnlineMediaGrid
      class="flex-1"
      :items="yt.resolved.items"
      :col-width="yt.resolved.kind === 'video' ? 1200 : 300"
      :min-cols="yt.resolved.kind === 'video' ? 1 : 2"
      :estimate-row-height="yt.resolved.kind === 'video' ? 220 : 300"
    >
      <template #header>
        <div class="pb-4">
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
        </div>
      </template>

      <template #default="{ item }">
        <OnlineMediaCard
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
          @open-channel="emit('openChannel', $event)"
        />
      </template>

      <template #footer>
        <p
          v-if="yt.resolved.items.length === 0"
          class="text-sm text-base-content/50 py-8 text-center"
        >
          {{ t('youtube.itemsCount', { count: 0 }) }}
        </p>
        <template v-else>
          <div v-if="resolvedCapped" class="flex justify-center py-4">
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
        </template>
      </template>
    </OnlineMediaGrid>
  </div>
</template>
