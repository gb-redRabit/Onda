<script setup lang="ts">
import type { Component } from 'vue';

// Przycisk z samą ikoną. `label` jest WYMAGANY i staje się nazwą dostępną
// (`aria-label`), więc żadnej ikony nie da się wydać bez nazwy dla czytnika ekranu.
// Dodatkowe atrybuty (class, data-testid, v-if) przechodzą przez fallthrough Vue.
const props = withDefaults(
  defineProps<{
    icon?: Component;
    label: string;
    /** Tooltip; domyślnie równy `label`. */
    title?: string;
    size?: number;
    /** Dla przycisków-przełączników (aria-pressed). */
    pressed?: boolean;
    variant?: 'default' | 'danger' | 'primary';
  }>(),
  { size: 14, variant: 'default' }
);

defineEmits<{ click: [e: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center p-1.5 rounded-field transition-colors duration-150 disabled:opacity-40"
    :class="[
      pressed ? 'bg-primary/15 text-primary-text' : 'hover:bg-base-content/8',
      variant === 'danger'
        ? 'text-error hover:text-error hover:bg-error/10'
        : variant === 'primary'
          ? 'text-primary-text hover:bg-primary/15'
          : pressed
            ? ''
            : 'text-base-content/55 hover:text-base-content'
    ]"
    :title="title ?? label"
    :aria-label="label"
    :aria-pressed="pressed"
    @click="$emit('click', $event)"
  >
    <slot>
      <component :is="props.icon" v-if="props.icon" :size="props.size" />
    </slot>
  </button>
</template>
