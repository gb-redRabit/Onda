<script setup lang="ts">
defineProps<{ padded?: boolean }>();
</script>

<template>
  <div
    class="rounded-box border border-base-300/70 bg-base-100 shadow-sm shadow-black/5"
    :class="padded === true ? 'overflow-hidden' : 'p-5 sm:p-6 space-y-5'"
  >
    <slot />
  </div>
</template>
