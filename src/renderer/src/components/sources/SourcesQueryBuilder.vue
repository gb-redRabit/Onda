<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import FieldLabel from './FieldLabel.vue';

// Wizualny builder zapytań: jedno pole na parametr skonfigurowany w endpoincie.
// Wpisana wartość nadpisuje domyślną z `endpoint.params` (main scala query po params).
const props = defineProps<{ keys: string[]; defaults: Record<string, string> }>();
const values = defineModel<Record<string, string>>({ required: true });

const { t } = useI18n();

function setValue(key: string, value: string): void {
  const next = { ...values.value };
  if (value) next[key] = value;
  else delete next[key];
  values.value = next;
}
</script>

<template>
  <div
    v-if="props.keys.length"
    class="px-4 py-2 border-b border-base-300 bg-base-100"
    data-testid="sources-query-builder"
  >
    <FieldLabel :text="t('sources.queryBuilderParams')" />
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label v-for="key in props.keys" :key="key" class="flex items-center gap-2 text-xs">
        <span class="w-24 shrink-0 font-mono text-base-content/60 truncate" :title="key">{{
          key
        }}</span>
        <input
          :value="values[key] ?? ''"
          :placeholder="props.defaults[key]"
          :aria-label="key"
          class="flex-1 min-w-0 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          @input="setValue(key, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>
