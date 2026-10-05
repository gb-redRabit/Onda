<script setup lang="ts">
// Grupa ustawień wewnątrz zakładki: przyklejony nagłówek + wiersze oddzielone
// cienką linią (płaska lista zamiast zagnieżdżonych kart, więc zakładkę czyta się jak spis treści).
defineProps<{ title?: string; description?: string; id?: string }>();
</script>

<template>
  <section :id="id" class="scroll-mt-11">
    <h3
      v-if="title"
      class="sticky top-0 z-10 -mx-6 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-base-content/60 bg-base-100/(--glass-alpha) backdrop-blur-sm border-b border-base-300/60"
    >
      {{ title }}
    </h3>
    <p v-if="description" class="pt-3 text-xs text-base-content/50">{{ description }}</p>
    <div class="divide-y divide-base-300/60 py-2">
      <slot />
    </div>
  </section>
</template>
