<script setup lang="ts">
/**
 * Heading block shared by the nine first-run wizard steps.
 *
 * Every step opened with the same `<h3>` and the same description paragraph,
 * hand-copied, and two of them had drifted: WizardAudio and WizardSummary carried
 * an extra `mb-5` on the description that the other seven did not, so those two
 * steps sat further from their content than the rest. The heading is also the
 * only thing giving a step its accessible name, so having it in one place is
 * what keeps that name present.
 *
 * Pass the resolved strings, not the keys: the wizard resolves them with the
 * global composer already, and taking `string` here keeps this component free of
 * an i18n dependency.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** Extra space below the description, for steps whose body is a plain form. */
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
