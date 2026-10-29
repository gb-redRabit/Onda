<script setup lang="ts">
// Przełącznik na bazie dotychczasowego `SettingsToggle`: `role="switch"`,
// `aria-checked`, nazwa z `label` albo z etykiety wiersza ustawień.
const model = defineModel<boolean>({ required: true });

withDefaults(
  defineProps<{
    disabled?: boolean;
    /** Nazwa dostępna; wymagana, gdy kontrolka nie ma widocznej etykiety. */
    label?: string;
    id?: string;
  }>(),
  {}
);
</script>

<template>
  <button
    :id="id"
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-45"
    :class="model ? 'bg-primary' : 'bg-base-300'"
    @click="model = !model"
  >
    <span
      class="inline-block h-5 w-5 rounded-full bg-neutral-content shadow-md transition-transform duration-200 ease-out"
      :class="model ? 'translate-x-6' : 'translate-x-1'"
    />
  </button>
</template>
