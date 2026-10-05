<script setup lang="ts">
import { type Component } from 'vue';

/**
 * Współdzielony blok pustego stanu.
 *
 * Istniały dwa takie — jeden tutaj, jeden w components/online — o tym samym
 * kształcie (ikona, tytuł, opis, slot) i różnym stylowaniu. Kopia z online jest
 * teraz wariantem `plain`: bez przerywanej ramki, większa ikona i więcej
 * pionowego luzu, czego chcą panele subskrypcji i wyszukiwania.
 *
 * `data-testid` jest przekazywany przez $attrs do elementu głównego, więc
 * wywołujący mogą wskazać konkretny pusty stan w testach E2E.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    icon?: Component;
    compact?: boolean;
    /**
     * `panel` to przerywane, obramowane pudełko czytane jako wbudowany placeholder.
     * `plain` jest bezramkowe i przestronniejsze, dla stanu "nic tu nie ma" na całym panelu.
     */
    variant?: 'panel' | 'plain';
  }>(),
  { compact: false, variant: 'panel' }
);
</script>

<template>
  <div
    v-if="variant === 'plain'"
    class="flex flex-col items-center justify-center py-16 px-4 text-center"
    role="status"
  >
    <component :is="icon" v-if="icon" :size="64" class="mb-4 text-base-content/50" />
    <p class="mb-1 text-lg font-semibold text-base-content">{{ title }}</p>
    <p v-if="description" class="max-w-md text-sm text-base-content/70">
      {{ description }}
    </p>
    <slot />
  </div>

  <div
    v-else
    class="flex flex-col items-center justify-center rounded-box border border-dashed border-base-300 text-center text-base-content/55"
    :class="compact ? 'gap-2 p-6' : 'gap-3 p-10'"
    role="status"
  >
    <component :is="icon" v-if="icon" :size="compact ? 28 : 40" class="opacity-35" />
    <div>
      <p class="text-sm font-medium text-base-content/75">{{ title }}</p>
      <p v-if="description" class="mt-1 text-xs">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
