<script setup lang="ts">
defineProps<{
  total: number;
  progress: number;
  results: Array<{ path: string; name: string; status: 'pending' | 'ok' | 'error'; msg?: string }>;
  running: boolean;
}>();
const emit = defineEmits<{ start: []; cancel: [] }>();
</script>

<template>
  <div class="border border-base-300 rounded-field p-2 space-y-2">
    <div class="text-xs font-medium">Batch: {{ total }} utworów — {{ progress }}/{{ total }}</div>
    <div class="w-full bg-base-300 rounded-full h-2 overflow-hidden">
      <div
        class="bg-primary h-2 transition-all"
        :style="{ width: (total ? (progress / total) * 100 : 0) + '%' }"
      ></div>
    </div>
    <div class="max-h-32 overflow-y-auto space-y-1">
      <div v-for="r in results" :key="r.path" class="flex items-center gap-2 text-xs">
        <span
          :class="
            r.status === 'ok'
              ? 'text-success'
              : r.status === 'error'
                ? 'text-error'
                : 'text-base-content/40'
          "
          >{{ r.status === 'ok' ? '✓' : r.status === 'error' ? '✗' : '…' }}</span
        >
        <span class="truncate flex-1">{{ r.name }}</span>
        <span class="text-base-content/50 truncate text-[11px]">{{ r.msg || '' }}</span>
      </div>
    </div>
    <div class="flex gap-2">
      <button
        v-if="!running"
        class="fx-noise flex-1 px-3 py-2 fx-depth rounded-field text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
        @click="emit('start')"
      >
        Zastosuj dla wszystkich ({{ total }})
      </button>
      <button
        v-else
        class="fx-noise flex-1 px-3 py-2 fx-depth rounded-field text-sm font-medium bg-error text-error-content hover:bg-error/90 transition-colors"
        @click="emit('cancel')"
      >
        Anuluj ({{ progress }}/{{ total }})
      </button>
    </div>
  </div>
</template>
