<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue';
import { SETTINGS_ROW_LABEL } from './settingsRowLabel';

const props = defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const attrs = useAttrs();
const rowLabel = inject(SETTINGS_ROW_LABEL, null);

// Nazwa dostępna: jawny `label` > etykieta wiersza ustawień > brak (gdy kontrolka
// jest gdzieś użyta samodzielnie bez kontekstu).
const accessibleName = computed(
  () =>
    props.label ??
    rowLabel?.value ??
    (typeof attrs['aria-label'] === 'string' ? attrs['aria-label'] : undefined)
);
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="accessibleName"
    :disabled="disabled"
    class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
    :class="modelValue ? 'bg-primary' : 'bg-base-300'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="inline-block h-5 w-5 transform rounded-full bg-neutral-content shadow-md transition-transform duration-200 ease-out"
      :class="modelValue ? 'translate-x-6' : 'translate-x-1'"
    />
  </button>
</template>
