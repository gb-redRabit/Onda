<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { SummaryItem } from '@renderer/utils/subscribeSummary';

defineProps<{ items: SummaryItem[] }>();

const { t } = useI18n();
</script>

<template>
  <div class="p-4 rounded-box bg-base-100 border border-base-300">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-3">
      {{ t('youtube.prefsSummary') }}
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
      <div
        v-for="(item, idx) in items"
        :key="idx"
        class="flex items-start justify-between gap-2 text-xs"
      >
        <span class="text-base-content/50">{{ item.label }}</span>
        <span class="text-base-content text-right truncate max-w-[60%]" :title="item.value">
          {{ item.value }}
        </span>
      </div>
    </div>
  </div>
</template>
