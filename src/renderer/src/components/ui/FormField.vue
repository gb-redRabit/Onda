<script setup lang="ts">
import { computed, useId } from 'vue';

// Etykieta + kontrolka + podpowiedź/błąd. Slot dostaje `id` i `describedby`,
// żeby kontrolka mogła je podpiąć bez ręcznego wymyślania identyfikatorów.
const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    error?: string;
    /** `id` kontrolki, gdy wywołujący chce je ustawić sam. */
    for?: string;
  }>(),
  {}
);

const fallbackId = useId();
const fieldId = computed(() => props.for ?? fallbackId);
const hintId = computed(() => `${fieldId.value}-hint`);
const errorId = computed(() => `${fieldId.value}-error`);
const describedBy = computed(() => {
  if (props.error) return errorId.value;
  if (props.hint) return hintId.value;
  return undefined;
});
</script>

<template>
  <div class="space-y-1.5">
    <label :for="fieldId" class="block text-xs font-medium text-base-content/70">
      {{ label }}
    </label>
    <slot :id="fieldId" :describedby="describedBy" />
    <p v-if="error" :id="errorId" class="text-[11px] text-error">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="text-[11px] text-base-content/50">{{ hint }}</p>
  </div>
</template>
