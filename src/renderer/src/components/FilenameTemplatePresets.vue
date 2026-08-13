<script setup lang="ts">
import { ref } from 'vue';
import { FILENAME_TEMPLATE_PRESETS } from '@renderer/utils/constants';

const emit = defineEmits<{ preset: [value: string] }>();
const selected = ref('');

function onSelect(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  selected.value = '';
  if (value) emit('preset', value);
}
</script>

<template>
  <select
    :value="selected"
    class="px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm text-fg-muted focus:border-accent-base focus:outline-none"
    @change="onSelect"
  >
    <option value="">{{ $t('settings.templatePresets') }}</option>
    <option v-for="p in FILENAME_TEMPLATE_PRESETS" :key="p" :value="p">{{ p }}</option>
  </select>
</template>
