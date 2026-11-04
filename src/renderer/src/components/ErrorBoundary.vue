<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';

const error = ref<Error | null>(null);
// Nowy klucz po „Spróbuj ponownie” wymusza remount slotu — samo wyczyszczenie
// błędu mogło natychmiast odtworzyć ten sam wyjątek w tej samej instancji.
const retryKey = ref(0);
const { t } = useI18n();
const ui = useUIStore();

function retry(): void {
  error.value = null;
  retryKey.value += 1;
}

onErrorCaptured((err) => {
  error.value = err;
  ui.notify('error', t('errorBoundary.notifTitle'), err.message || String(err));
  return false;
});
</script>

<template>
  <div class="flex-1 min-h-0">
    <div v-if="error" class="flex items-center justify-center h-full p-8">
      <div class="max-w-md p-6 rounded-box bg-error/10 border border-error/20 text-center">
        <div class="text-3xl mb-2">!</div>
        <h3 class="text-lg font-semibold text-error mb-2">{{ $t('errorBoundary.title') }}</h3>
        <pre class="text-xs text-error/70 font-mono whitespace-pre-wrap mb-4">{{
          error.message
        }}</pre>
        <button
          type="button"
          class="fx-noise px-4 py-2 fx-depth rounded-field bg-error/20 text-error text-sm font-medium hover:bg-error/30 transition-colors"
          @click="retry"
        >
          {{ $t('errorBoundary.retry') }}
        </button>
      </div>
    </div>
    <div v-else :key="retryKey" class="contents"><slot /></div>
  </div>
</template>
