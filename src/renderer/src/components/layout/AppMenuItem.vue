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
    class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
    :aria-label="label"
    v-bind="$attrs"
  >
    <component :is="icon" v-if="icon" :size="13" />
    <slot />
    <span v-if="$slots.hint" class="ml-auto text-[10px] text-base-content/50 font-mono">
      <slot name="hint" />
    </span>
  </button>
</template>
