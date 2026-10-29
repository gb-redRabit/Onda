<script setup lang="ts">
// Wspólny wiersz menu (`role="menuitem"`). Wcześniej cały markup przycisku był
// powielany kilkanaście razy w AppMenu.vue. `label` daje dostępną nazwę, gdy
// treść pochodzi wyłącznie ze slotu (statycznie nieczytelnego dla testów a11y).
defineProps<{ icon?: unknown; label?: string }>();
</script>

<template>
  <button
    role="menuitem"
    tabindex="-1"
    class="group mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-base-content/75 transition-colors hover:bg-primary/10 hover:text-primary-text focus-visible:bg-primary/10 focus-visible:text-primary-text focus-visible:outline-hidden"
    :aria-label="label"
    v-bind="$attrs"
  >
    <component
      :is="icon"
      v-if="icon"
      :size="14"
      class="shrink-0 text-base-content/50 group-hover:text-primary-text/80"
    />
    <slot />
    <span
      v-if="$slots.hint"
      class="ml-auto rounded-md bg-base-content/5 px-1.5 py-0.5 text-[10px] font-mono text-base-content/45 group-hover:bg-primary/10 group-hover:text-primary-text/80"
    >
      <slot name="hint" />
    </span>
  </button>
</template>
