<script setup lang="ts">
import { computed } from 'vue';
import { highlightSegments } from '@renderer/utils/highlightSegments';

// Renderuje podświetlone trafienia wyszukiwania bez `v-html`. Metadane utworów
// pochodzą z niezaufanych plików, więc trafienia są zwykłymi dziećmi tekstowymi —
// nic nie jest interpretowane jako HTML.
const props = defineProps<{
  text: string;
  query?: string;
}>();

const segments = computed(() => highlightSegments(props.text, props.query));
</script>

<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.match" class="bg-primary/20 text-primary px-0.5 rounded">{{
        segment.text
      }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>
