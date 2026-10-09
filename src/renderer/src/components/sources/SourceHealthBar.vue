<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, XCircle, Loader2 } from '@lucide/vue';

// Pasek kondycji aktywnego źródła. `state` jest jawnym stringiem, a nie
// `boolean`, ponieważ brak wartości boolowskiego propa w Vue jest rzutowany na
// `false` — co fałszywie pokazywałoby „błąd połączenia" przed pierwszym testem.
const props = defineProps<{
  state: 'checking' | 'ok' | 'fail' | 'unknown';
  error?: string;
  /** Znacznik czasu ostatniego testu (ms). */
  at?: number;
  /** Czas odpowiedzi ostatniego testu (ms). */
  ms?: number;
  itemCount: number;
  downloadedCount: number;
}>();

const time = computed(() => (props.at ? new Date(props.at).toLocaleTimeString() : ''));
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="flex items-center gap-3 px-4 py-1 text-[11px] border-b border-base-300 text-base-content/60"
    data-testid="source-health"
  >
    <span v-if="state === 'checking'" class="flex items-center gap-1 text-warning">
      <Loader2 :size="12" class="animate-spin" />
      {{ $t('sources.health.checking') }}
    </span>
    <span v-else-if="state === 'ok'" class="flex items-center gap-1 text-success">
      <CheckCircle2 :size="12" />
      {{ $t('sources.health.ok') }}
    </span>
    <span v-else-if="state === 'fail'" class="flex items-center gap-1 text-error" :title="error">
      <XCircle :size="12" />
      {{ $t('sources.health.fail') }}
    </span>
    <span v-else class="text-base-content/40">{{ $t('sources.health.unknown') }}</span>

    <span v-if="time" :title="$t('sources.health.checkedAt')">{{ time }}</span>
    <span v-if="ms !== undefined" class="font-mono">{{ ms }} ms</span>

    <span class="flex-1" />
    <span>{{ $t('sources.health.items', { n: itemCount }) }}</span>
    <span>{{ $t('sources.health.downloaded', { n: downloadedCount }) }}</span>
  </div>
</template>
