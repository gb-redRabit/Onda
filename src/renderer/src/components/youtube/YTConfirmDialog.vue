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
      class="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="close"
    >
      <div
        class="bg-bg-surface border border-border-default rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
      >
        <div class="flex items-start gap-3 p-5">
          <div
            class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            :class="
              variant === 'danger'
                ? 'bg-red-base/10 text-red-base'
                : 'bg-amber-base/10 text-amber-base'
            "
          >
            <AlertTriangle :size="18" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold text-fg-base">{{ title }}</h3>
            <p v-if="message" class="text-xs text-fg-muted mt-1">{{ message }}</p>
          </div>
          <button
            class="p-1 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default">
          <button
            class="px-4 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors"
            @click="close"
          >
            {{ cancelText || $t('common.cancel') }}
          </button>
          <button
            class="px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors"
            :class="
              variant === 'danger'
                ? 'bg-red-base hover:bg-red-base/90'
                : 'bg-accent-base hover:bg-accent-hover'
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
