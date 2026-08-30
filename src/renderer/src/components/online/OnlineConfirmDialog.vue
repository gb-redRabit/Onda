<script setup lang="ts">
import { AlertTriangle, X } from '@lucide/vue';

withDefaults(
  defineProps<{
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'default';
  }>(),
  {
    variant: 'default'
  }
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function close() {
  emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-10000 bg-neutral/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="close"
    >
      <div
        class="bg-base-100 border border-base-300 rounded-box w-full max-w-sm shadow-2xl overflow-hidden"
      >
        <div class="flex items-start gap-3 p-5">
          <div
            class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            :class="variant === 'danger' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'"
          >
            <AlertTriangle :size="18" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold text-base-content">{{ title }}</h3>
            <p v-if="message" class="text-xs text-base-content/70 mt-1">{{ message }}</p>
          </div>
          <button
            class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-300">
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
            @click="close"
          >
            {{ cancelText || $t('common.cancel') }}
          </button>
          <button
            class="fx-noise px-4 py-2 fx-depth rounded-field text-sm font-medium transition-colors"
            :class="
              variant === 'danger'
                ? 'bg-error hover:bg-error/90 text-error-content'
                : 'bg-primary hover:bg-primary/90 text-primary-content'
            "
            @click="emit('confirm')"
          >
            {{ confirmText || $t('common.ok') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
