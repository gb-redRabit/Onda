<script setup lang="ts">
import { CheckCircle2, AlertCircle, X } from '@lucide/vue';

// Bottom-center transient toast used by views that own their own short-lived
// status messages (SourcesView). The app-wide toast queue lives in
// `ToastNotification.vue` / `stores/ui.ts`.

defineProps<{
  message: string;
  ok: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-100 flex items-center gap-2 px-4 py-2.5 rounded-box shadow-2xl border text-sm max-w-[80vw]"
      :class="
        ok
          ? 'bg-base-100 border-success/40 text-base-content'
          : 'bg-base-100 border-error/40 text-base-content'
      "
    >
      <CheckCircle2 v-if="ok" :size="16" class="text-success shrink-0" />
      <AlertCircle v-else :size="16" class="text-error shrink-0" />
      <span class="truncate">{{ message }}</span>
      <button
        class="fx-noise p-0.5 fx-depth rounded-field text-base-content/50 hover:text-base-content"
        @click="emit('close')"
      >
        <X :size="14" />
      </button>
    </div>
  </Teleport>
</template>
