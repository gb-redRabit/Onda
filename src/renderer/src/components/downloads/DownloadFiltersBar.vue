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
  <div
    class="flex flex-wrap items-center gap-1.5 border-b border-base-300/80 bg-base-100/60 px-5 py-2.5"
  >
    <button
      v-for="f in filters"
      :key="f.id"
      type="button"
      :aria-pressed="filter === f.id"
      :data-testid="`downloads-filter-${f.id}`"
      class="h-7 rounded-full border px-3 text-xs font-medium transition-colors"
      :class="
        filter === f.id
          ? 'bg-primary/18 text-primary-text border-primary/35'
          : 'bg-base-200/50 text-base-content/65 border-base-300/70 hover:border-base-content/20 hover:text-base-content'
      "
      @click="filter = f.id"
    >
      {{ t(f.labelKey) }} ({{ f.count }})
    </button>
    <div class="flex-1" />
    <select
      v-if="channels.length"
      v-model="channelFilter"
      :aria-label="t('downloads.filterChannel')"
      class="h-7 rounded-field border border-base-300 bg-base-100 px-2.5 text-xs focus:border-primary focus:outline-none"
    >
      <option value="">{{ t('downloads.filterAllChannels') }}</option>
      <option v-for="[id, title] in channels" :key="id" :value="id">{{ title }}</option>
    </select>
  </div>
</template>
