<script setup lang="ts">
defineProps<{ padded?: boolean }>();
</script>

<template>
  <div
    class="rounded-2xl border border-border-default/70 bg-bg-elevated shadow-sm shadow-black/5"
    :class="padded === true ? 'overflow-hidden' : 'p-5 sm:p-6 space-y-5'"
  >
    <slot />
  </div>
</template>
