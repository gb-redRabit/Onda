<script setup lang="ts">
import { computed } from 'vue';

interface Option<T = string> {
  value: T;
  label: string;
  icon?: unknown;
  disabled?: boolean;
}

const props = defineProps<{
  modelValue: string;
  options: Option[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const normalized = computed(() =>
  props.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
);
</script>

<template>
  <div class="inline-flex items-center gap-1 bg-bg-elevated rounded-xl p-1">
    <button
      v-for="opt in normalized"
      :key="opt.value"
      type="button"
      class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
      :class="
        modelValue === opt.value
          ? 'bg-bg-surface text-fg-base shadow-sm'
          : 'text-fg-faint hover:text-fg-muted'
      "
      :disabled="opt.disabled"
      @click="emit('update:modelValue', opt.value)"
    >
      <component :is="opt.icon" v-if="opt.icon" :size="14" class="mr-1 inline" />
      {{ opt.label }}
    </button>
  </div>
</template>
