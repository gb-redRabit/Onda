<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { SourceSortMode } from '@renderer/utils/sourcesView';

const filterText = defineModel<string>('filterText', { required: true });
const sortMode = defineModel<SourceSortMode>('sortMode', { required: true });

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2 px-4 py-1.5 border-b border-base-300">
    <input
      v-model="filterText"
      type="text"
      :placeholder="t('sources.filterPlaceholder')"
      class="flex-1 min-w-0 px-2.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
    />
    <select
      v-model="sortMode"
      class="shrink-0 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      :title="t('sources.sortBy')"
    >
      <option value="none">{{ t('sources.sortNone') }}</option>
      <option value="titleAsc">{{ t('sources.sortTitleAsc') }}</option>
      <option value="titleDesc">{{ t('sources.sortTitleDesc') }}</option>
      <option value="type">{{ t('sources.sortType') }}</option>
    </select>
  </div>
</template>
