<script setup lang="ts">
import { AlertCircle } from '@lucide/vue';

defineProps<{
  message: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <AlertCircle :size="40" class="text-error mb-3" />
    <p class="text-sm text-base-content/70 mb-1">{{ message }}</p>
    <button
      class="fx-noise mt-3 px-4 py-1.5 fx-depth rounded-field bg-base-content/10 border border-base-300 text-xs text-base-content hover:bg-base-100 transition-colors"
      @click="emit('retry')"
    >
      {{ $t('youtube.search') }}
    </button>
  </div>
</template>
