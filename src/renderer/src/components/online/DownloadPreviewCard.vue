<script setup lang="ts">
import { Image } from '@lucide/vue';

// Sam podgląd okładki. Tytuł i kanał są już w nagłówku dialogu, więc
// powtarzanie ich tutaj tylko zabierało miejsce.
defineProps<{ thumbnail?: string; title: string }>();
</script>

<template>
  <div class="aspect-video overflow-hidden rounded-box border border-base-300 bg-base-100">
    <img v-if="thumbnail" :src="thumbnail" :alt="title" class="h-full w-full object-cover" />
    <div v-else class="flex h-full w-full items-center justify-center text-base-content/50">
      <Image :size="32" />
    </div>
  </div>
</template>
