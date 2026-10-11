<script setup lang="ts">
// Mikro-etykieta pola w kreatorze źródła — jedna definicja zamiast ~20 kopii klasy.
withDefaults(defineProps<{ text: string; htmlFor?: string; tight?: boolean; upper?: boolean }>(), {
  tight: false,
  upper: true
});
</script>

<template>
  <label
    :for="htmlFor"
    class="block text-[11px] font-medium text-base-content/50 tracking-wider"
    :class="[upper ? 'uppercase' : '', tight ? 'mb-0.5' : 'mb-1']"
  >
    {{ text }}
  </label>
</template>
