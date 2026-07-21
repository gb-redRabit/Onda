<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  error.value = err;
  return false;
});
</script>

<template>
  <div class="flex-1 min-h-0">
    <div v-if="error" class="flex items-center justify-center h-full p-8">
      <div class="max-w-md p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center">
        <div class="text-3xl mb-2">!</div>
        <h3 class="text-lg font-semibold text-red-400 mb-2">Wystąpił nieoczekiwany błąd</h3>
        <pre class="text-xs text-red-400/70 font-mono whitespace-pre-wrap mb-4">{{
          error.message
        }}</pre>
        <button
          class="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
          @click="error = null"
        >
          Spróbuj ponownie
        </button>
      </div>
    </div>
    <slot v-else />
  </div>
</template>
