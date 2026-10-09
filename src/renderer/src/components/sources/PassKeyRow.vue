<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Trash2 } from '@lucide/vue';
import type { DraftPassKey } from './endpointDraft';

// Jeden wiersz klucza przekazywanego dalej (`from → as`, typ, usuń). Wyodrębnione,
// bo ten sam układ był kopiowany w `EndpointPassKeys` i `EndpointTableConfig`.
const props = defineProps<{ modelValue: DraftPassKey; options: string[]; idBase: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: DraftPassKey]; remove: [] }>();
const { t } = useI18n();

function update(patch: Partial<DraftPassKey>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <input
      :value="modelValue.from"
      type="text"
      :list="`${idBase}-from`"
      placeholder="anime_episode_number"
      class="flex-1 min-w-0 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      @input="update({ from: ($event.target as HTMLInputElement).value })"
    />
    <datalist :id="`${idBase}-from`">
      <option v-for="o in options" :key="o" :value="o" />
    </datalist>
    <span aria-hidden="true" class="text-base-content/50 text-xs">→</span>
    <input
      :value="modelValue.as"
      type="text"
      placeholder="n"
      class="w-24 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      @input="update({ as: ($event.target as HTMLInputElement).value })"
    />
    <select
      :value="modelValue.type"
      class="px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none"
      @change="update({ type: ($event.target as HTMLSelectElement).value as 'string' | 'number' })"
    >
      <option value="string">{{ t('sources.keyString') }}</option>
      <option value="number">{{ t('sources.keyNumber') }}</option>
    </select>
    <button
      type="button"
      class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-error transition-colors"
      :aria-label="t('common.delete')"
      @click="emit('remove')"
    >
      <Trash2 :size="12" />
    </button>
  </div>
</template>
