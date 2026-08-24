<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  visible: boolean;
  isConfirm: boolean;
  message: string;
  value: string;
}>();

const emit = defineEmits<{
  'update:value': [value: string];
  confirm: [];
  cancel: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.visible,
  (visible) => {
    if (visible && !props.isConfirm) {
      nextTick(() => {
        inputRef.value?.focus();
        inputRef.value?.select();
      });
    }
  }
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') emit('confirm');
  if (e.key === 'Escape') emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-9999 bg-black/50 flex items-center justify-center"
      @click.self="emit('cancel')"
    >
      <div class="bg-base-100 border border-base-300 rounded-box p-5 min-w-75 shadow-2xl">
        <p class="text-sm text-base-content mb-3 whitespace-pre-wrap">{{ message }}</p>
        <input
          v-if="!isConfirm"
          ref="inputRef"
          :value="value"
          type="text"
          class="w-full px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm text-base-content outline-none focus:ring-1 focus:ring-primary"
          @input="emit('update:value', ($event.target as HTMLInputElement).value)"
          @keydown="onKeydown"
        />
        <div class="flex justify-end gap-2 mt-4">
          <button
            class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
            @click="emit('cancel')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            class="fx-noise px-4 py-1.5 fx-depth rounded-field text-xs bg-primary text-primary-content hover:bg-primary/90 transition-colors"
            @click="emit('confirm')"
          >
            {{ $t('common.ok') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
