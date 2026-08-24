<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckSquare, Download } from '@lucide/vue';
import OnlineButton from './OnlineButton.vue';

const props = defineProps<{
  selectedCount: number;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
}>();

const emit = defineEmits<{
  'update:rangeStart': [value: number];
  'update:rangeEnd': [value: number];
  selectAll: [];
  selectRange: [];
  addSelected: [];
}>();

const { t } = useI18n();

const allSelected = computed(
  () => props.selectedCount > 0 && props.selectedCount === props.totalCount
);
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 p-2 rounded-box bg-base-100 border border-base-300">
    <OnlineButton variant="secondary" size="sm" @click="emit('selectAll')">
      <CheckSquare :size="12" />
      {{ allSelected ? $t('common.deselectAll') : $t('common.selectAll') }}
    </OnlineButton>

    <div class="flex items-center gap-1.5 text-xs text-base-content/50">
      <span>{{ t('youtube.range') }}</span>
      <input
        :value="rangeStart"
        type="number"
        min="1"
        class="w-14 px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
        @input="emit('update:rangeStart', Number(($event.target as HTMLInputElement).value))"
      />
      <span>-</span>
      <input
        :value="rangeEnd"
        type="number"
        min="1"
        class="w-14 px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
        @input="emit('update:rangeEnd', Number(($event.target as HTMLInputElement).value))"
      />
      <OnlineButton variant="secondary" size="sm" @click="emit('selectRange')">
        {{ t('youtube.rangeSelect') }}
      </OnlineButton>
    </div>

    <div class="flex-1" />

    <OnlineButton
      variant="primary"
      size="sm"
      :disabled="selectedCount === 0"
      @click="emit('addSelected')"
    >
      <Download :size="12" />
      {{ t('youtube.addSelected', { count: selectedCount }) }}
    </OnlineButton>
  </div>
</template>
