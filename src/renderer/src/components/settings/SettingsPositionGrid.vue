<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  modelValue: string;
  options: Array<{ id: string; label: string; icon: Component }>;
  columns?: 2 | 3 | 4;
  selectedLabel?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();
</script>

<template>
  <div>
    <div
      class="w-full rounded-box bg-base-200/[var(--glass-alpha)] border-2 border-base-300 p-2 relative select-none"
    >
      <div class="grid gap-2" :class="columns === 4 ? 'grid-cols-4' : 'grid-cols-2'">
        <button
          v-for="opt in options"
          :key="opt.id"
          class="fx-depth rounded-box fx-noise text-[11px] font-medium transition-all border-2 flex flex-col items-center justify-center gap-1 min-h-16"
          :class="
            modelValue === opt.id
              ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/20'
              : 'border-transparent text-base-content/50 hover:bg-base-content/10 hover:text-base-content/70'
          "
          @click="emit('update:modelValue', opt.id)"
        >
          <component :is="opt.icon" :size="16" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
      <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div class="w-5 h-5 rounded-field border-2 border-dashed border-base-content/20" />
      </div>
    </div>
    <p v-if="selectedLabel" class="text-[11px] text-base-content/50 mt-2">
      {{ $t('settings.selected') }}
      <span class="text-base-content font-medium">{{ selectedLabel }}</span>
    </p>
  </div>
</template>
