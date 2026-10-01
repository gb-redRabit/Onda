<script setup lang="ts">
/**
 * Blok nagłówka współdzielony przez dziewięć kroków kreatora pierwszego uruchomienia.
 *
 * Każdy krok otwierał się tym samym `<h3>` i tym samym akapitem opisu,
 * kopiowanym ręcznie, a dwa z nich się rozjechały: WizardAudio i WizardSummary
 * miały dodatkowe `mb-5` na opisie, którego pozostałe siedem nie miało, więc te dwa
 * kroki były dalej od swojej treści niż reszta. Nagłówek jest też jedyną rzeczą
 * nadającą krokowi jego dostępną nazwę, więc trzymanie go w jednym miejscu
 * utrzymuje tę nazwę obecną.
 *
 * Przekazuj rozwiązane łańcuchy, nie klucze: kreator rozwiązuje je już globalnym
 * composerem, a przyjęcie tutaj `string` trzyma ten komponent wolnym od
 * zależności i18n.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** Dodatkowa przestrzeń pod opisem, dla kroków, których treścią jest zwykły formularz. */
    descriptionGap?: boolean;
  }>(),
  { descriptionGap: false }
);
</script>

<template>
  <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ title }}</h3>
  <p v-if="description" class="text-sm text-base-content/70" :class="descriptionGap ? 'mb-5' : ''">
    {{ description }}
  </p>
  <slot />
</template>
