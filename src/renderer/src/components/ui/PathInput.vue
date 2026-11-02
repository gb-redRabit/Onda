<script setup lang="ts">
import { FolderOpen } from '@lucide/vue';
import IconButton from './IconButton.vue';
import Input from './Input.vue';

// Ścieżka + wybór folderu w jednym wierszu. Dialog otwiera wywołujący
// (`@browse`), bo to on wie, co zrobić z wynikiem (np. dopisać nazwę pliku).
const model = defineModel<string>({ required: true });

withDefaults(
  defineProps<{
    label: string;
    placeholder?: string;
    /** Pola ścieżek zwykle tylko do odczytu — edycja ręczna prowadzi do literówek. */
    readonly?: boolean;
    disabled?: boolean;
    /** Pokaż „Wyczyść”, gdy ścieżka jest ustawiona. */
    clearable?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { readonly: true, clearable: false, size: 'md' }
);

defineEmits<{ browse: [] }>();
</script>

<template>
  <div class="flex items-center gap-1.5">
    <Input
      v-model="model"
      :size="size"
      :aria-label="label"
      :placeholder="placeholder"
      :readonly="readonly"
      :disabled="disabled"
      class="min-w-0 flex-1"
    />
    <IconButton
      :icon="FolderOpen"
      :label="label"
      :size="13"
      class="shrink-0 border border-hairline"
      :disabled="disabled"
      @click="$emit('browse')"
    />
    <button
      v-if="clearable && model"
      type="button"
      class="shrink-0 rounded-field px-2 py-1 text-xs text-base-content/50 transition-colors hover:text-base-content"
      :disabled="disabled"
      @click="model = ''"
    >
      {{ $t('common.clear') }}
    </button>
  </div>
</template>
