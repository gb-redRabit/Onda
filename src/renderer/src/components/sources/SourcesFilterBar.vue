<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Search, X } from '@lucide/vue';
import type { SourceSortMode } from '@renderer/utils/sourcesView';

const filterText = defineModel<string>('filterText', { required: true });
const sortMode = defineModel<SourceSortMode>('sortMode', { required: true });

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300">
    <div class="relative flex-1 min-w-0">
      <Search
        :size="14"
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40"
      />
      <input
        v-model="filterText"
        type="text"
        :placeholder="t('sources.filterPlaceholder')"
        :aria-label="t('sources.filterPlaceholder')"
        class="w-full pl-8 pr-8 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <button
        v-if="filterText"
        class="ui-icon-button absolute right-1.5 top-1/2 -translate-y-1/2 p-1"
        :aria-label="t('sources.clearFilter')"
        :title="t('sources.clearFilter')"
        @click="filterText = ''"
      >
        <X :size="13" />
      </button>
    </div>
    <select
      v-model="sortMode"
      class="shrink-0 px-2 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
      :title="t('sources.sortBy')"
      :aria-label="t('sources.sortBy')"
    >
      <option value="none">{{ t('sources.sortNone') }}</option>
      <option value="titleAsc">{{ t('sources.sortTitleAsc') }}</option>
      <option value="titleDesc">{{ t('sources.sortTitleDesc') }}</option>
      <option value="type">{{ t('sources.sortType') }}</option>
    </select>
  </div>
</template>
