<script setup lang="ts">
defineProps<{ padded?: boolean }>();
</script>

<template>
  <div
    class="rounded-2xl border border-border-default bg-bg-elevated p-3 flex flex-col gap-3 "
    :class="padded === false ? 'overflow-hidden' : 'p-6 space-y-6'"
  >
    <slot />
  </div>
</template>
