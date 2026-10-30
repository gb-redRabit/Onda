<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

// Lekki tooltip dla przycisków z samą ikoną. Nie pozycjonuje się względem
// krawędzi okna — dla elementów przy brzegu użyj `title` albo miejsca w layoutcie.
const props = withDefaults(
  defineProps<{
    text: string;
    /** Opóźnienie pojawienia się (ms), żeby hover nie migał. */
    delay?: number;
  }>(),
  { delay: 300 }
);

const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function show(): void {
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    visible.value = true;
  }, props.delay);
}

function hide(): void {
  clearTimer();
  visible.value = false;
}

onBeforeUnmount(clearTimer);
</script>

<template>
  <span
    class="relative inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @keydown.esc="hide"
  >
    <slot />
    <span
      v-if="visible"
      role="tooltip"
      class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-field border border-base-300 bg-base-100 px-2 py-1 text-2xs text-base-content shadow-md"
    >
      {{ text }}
    </span>
  </span>
</template>
