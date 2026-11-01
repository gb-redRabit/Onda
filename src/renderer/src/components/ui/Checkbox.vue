<script setup lang="ts">
import { computed, useId } from 'vue';

// Checkbox z widoczną etykietą: `label` jest wymagany, a `id` wiąże etykietę
// z kontrolką (bez tego klik w tekst nie zaznacza). Dla etykiety ukrytej użyj
// `ui/Switch` albo `FormField`.
const model = defineModel<boolean>({ required: true });

withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
    /** Dodatkowy opis pod etykietą (np. konsekwencja włączenia). */
    hint?: string;
  }>(),
  {}
);

const id = useId();
const hintId = computed(() => `${id}-hint`);
</script>

<template>
  <div class="flex items-start gap-2">
    <input
      :id="id"
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      :aria-describedby="hint ? hintId : undefined"
      class="mt-0.5 h-4 w-4 shrink-0 rounded-field border-hairline accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-45"
    />
    <div class="min-w-0">
      <label :for="id" class="block cursor-pointer text-sm text-base-content">{{ label }}</label>
      <p v-if="hint" :id="hintId" class="text-2xs text-base-content/50">{{ hint }}</p>
    </div>
  </div>
</template>
