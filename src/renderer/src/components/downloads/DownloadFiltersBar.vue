<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DownloadFilter } from '@renderer/utils/downloadsView';

defineProps<{
  filters: Array<{ id: DownloadFilter; labelKey: string; count: number }>;
  channels: Array<[string, string]>;
}>();
const filter = defineModel<DownloadFilter>('filter', { required: true });
const channelFilter = defineModel<string>('channelFilter', { required: true });

const { t } = useI18n();
</script>

<template>
  <div class="px-4 py-2 border-b border-base-300 flex gap-1 items-center flex-wrap">
    <button
      v-for="f in filters"
      :key="f.id"
      class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
      :class="
        filter === f.id
          ? 'bg-primary text-primary-content'
          : 'text-base-content/70 hover:bg-base-content/10'
      "
      @click="filter = f.id"
    >
      {{ t(f.labelKey) }} ({{ f.count }})
    </button>
    <div class="flex-1" />
    <select
      v-if="channels.length"
      v-model="channelFilter"
      class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:border-primary focus:outline-none"
    >
      <option value="">{{ t('downloads.filterAllChannels') }}</option>
      <option v-for="[id, title] in channels" :key="id" :value="id">{{ title }}</option>
    </select>
  </div>
</template>
