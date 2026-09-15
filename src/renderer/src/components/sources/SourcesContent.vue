<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { AlertCircle, Globe } from '@lucide/vue';
import SourceCard from './SourceCard.vue';
import SourcePageView from './SourcePageView.vue';
import Loader from '@renderer/components/layout/Loader.vue';
import type { SourceItem } from '@renderer/types/sources';

defineProps<{
  error: string;
  isAuthError: boolean;
  isPage: boolean;
  pageItem?: SourceItem;
  rows: SourceItem[];
  rowLoading: boolean;
  rowClickable: boolean;
  downloadable: boolean;
  items: SourceItem[];
  displayItems: SourceItem[];
  loading: boolean;
  filterText: string;
  hasMore: boolean;
  paginationMode: string;
  downloadingItem: SourceItem | null;
}>();
const emit = defineEmits<{
  rowClick: [SourceItem];
  download: [SourceItem];
  downloadAll: [SourceItem[]];
  preview: [SourceItem];
  fetchMore: [];
  editSource: [];
}>();

const { t } = useI18n();
</script>

<template>
  <p v-if="error" class="text-xs text-error mb-3 px-4 flex items-center gap-2">
    <AlertCircle :size="12" class="shrink-0" />
    <span class="flex-1 truncate">{{ error }}</span>
    <button
      v-if="isAuthError"
      class="fx-noise shrink-0 px-2 py-0.5 fx-depth rounded-field border border-error/40 text-error hover:bg-error/10 transition-colors"
      @click="emit('editSource')"
    >
      {{ t('sources.editSourceShortcut') }}
    </button>
  </p>
  <SourcePageView
    v-if="isPage && pageItem"
    :item="pageItem"
    :rows="rows"
    :row-loading="rowLoading"
    :row-clickable="rowClickable"
    :downloadable="downloadable"
    @row-click="emit('rowClick', $event)"
    @download="emit('download', $event)"
    @download-all="emit('downloadAll', $event)"
  />
  <div v-else class="p-4">
    <div
      v-if="items.length"
      class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
    >
      <SourceCard
        v-for="(item, i) in displayItems"
        :key="item.id || `${item.id}-${i}`"
        :item="item"
        :downloading="downloadingItem === item"
        :downloadable="downloadable"
        @preview="emit('preview', $event)"
        @download="emit('download', $event)"
      />
    </div>
    <div
      v-else-if="loading"
      class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
    >
      <Loader :size="56" />
      <p class="text-sm">{{ t('sources.refresh') }}...</p>
    </div>
    <div
      v-else-if="displayItems.length === 0 && filterText"
      class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
    >
      <Globe :size="32" class="opacity-50" />
      <p class="text-sm">{{ t('sources.noItems') }}</p>
    </div>
    <div
      v-else-if="!loading"
      class="h-full flex flex-col items-center justify-center gap-2 text-base-content/50"
    >
      <Globe :size="32" class="opacity-50" />
      <p class="text-sm">{{ t('sources.noItems') }}</p>
    </div>
    <button
      v-if="hasMore && items.length && paginationMode !== 'page'"
      class="fx-noise mt-4 mx-auto block px-4 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
      :disabled="loading"
      @click="emit('fetchMore')"
    >
      {{ t('sources.loadMore') }}
    </button>
  </div>
</template>
