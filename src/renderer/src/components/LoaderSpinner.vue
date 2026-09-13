<script setup lang="ts">
withDefaults(defineProps<{ label?: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-base-content/60">
    <div
      class="border border-primary border-t-transparent rounded-full animate-spin"
      :class="size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'"
    />
    <span v-if="label" class="text-xs">{{ label }}</span>
  </div>
</template>
