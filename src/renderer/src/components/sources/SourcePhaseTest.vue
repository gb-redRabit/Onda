<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { FlaskConical } from '@lucide/vue';

// Faza końcowa „Test" — uruchamia test pierwszego poziomu i pokazuje wynik,
// surową odpowiedź oraz nagłówki (wartości wrażliwe zamaskowane w main).
defineProps<{
  saveHint: boolean;
  testMsg: string;
  testPassed: boolean;
  prettyRaw: string;
  headerRows: Array<[string, string]>;
  errorMsg: string;
}>();
const emit = defineEmits<{ test: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="space-y-3">
    <button
      class="fx-noise flex items-center gap-1.5 px-3 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors"
      @click="emit('test')"
    >
      <FlaskConical :size="14" />
      {{ t('sources.test') }}
    </button>

    <p v-if="testMsg" class="text-xs" :class="testPassed ? 'text-success' : 'text-error'">
      {{ testMsg }}
    </p>
    <p v-if="saveHint" class="text-xs text-warning">{{ t('sources.testSaveHint') }}</p>

    <details
      v-if="prettyRaw"
      class="rounded-field border border-base-300 bg-base-100/50"
      data-testid="source-test-raw"
    >
      <summary class="cursor-pointer px-3 py-2 text-[11px] font-medium text-base-content/60">
        {{ t('sources.testRaw') }}
      </summary>
      <pre
        class="max-h-64 overflow-auto px-3 pb-3 text-[10px] font-mono whitespace-pre-wrap break-all"
        >{{ prettyRaw }}</pre>
    </details>

    <details
      v-if="headerRows.length"
      class="rounded-field border border-base-300 bg-base-100/50"
      data-testid="source-test-headers"
    >
      <summary class="cursor-pointer px-3 py-2 text-[11px] font-medium text-base-content/60">
        {{ t('sources.responseHeaders') }}
      </summary>
      <dl class="px-3 pb-3 text-[10px] font-mono space-y-0.5">
        <div v-for="[key, value] in headerRows" :key="key" class="flex gap-2">
          <dt class="shrink-0 text-base-content/50">{{ key }}:</dt>
          <dd class="break-all">{{ value }}</dd>
        </div>
      </dl>
    </details>

    <p v-if="errorMsg" class="text-xs text-error">{{ errorMsg }}</p>
  </div>
</template>
