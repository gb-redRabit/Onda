<script setup lang="ts">
import { computed } from 'vue';

// Przełącznik na bazie dotychczasowego `SettingsToggle`: `role="switch"`,
// `aria-checked`, nazwa z `label` albo z etykiety wiersza ustawień.
const model = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    /** Nazwa dostępna; wymagana, gdy kontrolka nie ma widocznej etykiety. */
    label?: string;
    id?: string;
    /** `sm` dla gęstych wierszy kart i pasków narzędzi. */
    size?: 'sm' | 'md';
  }>(),
  { size: 'md' }
);

const track = computed(() => (props.size === 'sm' ? 'h-5 w-9' : 'h-7 w-12'));
const thumb = computed(() => (props.size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'));
const on = computed(() => (props.size === 'sm' ? 'translate-x-4' : 'translate-x-6'));
</script>

<template>
  <button
    :id="id"
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    class="relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-45"
    :class="[track, model ? 'bg-primary' : 'bg-base-300']"
    @click="model = !model"
  >
    <span
      class="inline-block rounded-full bg-neutral-content shadow-md transition-transform duration-200 ease-out"
      :class="[thumb, model ? on : 'translate-x-1']"
    />
  </button>
</template>
