<script setup lang="ts">
const emit = defineEmits<{
  about: [];
  shortcuts: [];
}>();
</script>

<template>
  <div
    class="absolute top-full left-0 mt-0.5 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/40 py-1.5 min-w-48 z-50"
  >
    <button
      class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
      @click="emit('about')"
    >
      {{ $t('menu.about') }}
    </button>
    <button
      class="w-full px-3 py-1.5 text-left text-xs text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors"
      @click="emit('shortcuts')"
    >
      {{ $t('menu.documentation') }}
    </button>
  </div>
</template>
