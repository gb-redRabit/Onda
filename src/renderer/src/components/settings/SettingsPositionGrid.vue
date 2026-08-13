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
      class="w-full rounded-2xl bg-bg-base border-2 border-border-default p-2 relative select-none"
    >
      <div class="grid gap-2" :class="columns === 4 ? 'grid-cols-4' : 'grid-cols-2'">
        <button
          v-for="opt in options"
          :key="opt.id"
          class="rounded-xl text-[11px] font-medium transition-all border-2 flex flex-col items-center justify-center gap-1 min-h-16"
          :class="
            modelValue === opt.id
              ? 'border-accent-base bg-accent-ghost text-accent-base shadow-sm shadow-accent-base/20'
              : 'border-transparent text-fg-faint hover:bg-bg-hover hover:text-fg-muted'
          "
          @click="emit('update:modelValue', opt.id)"
        >
          <component :is="opt.icon" :size="16" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
      <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div class="w-5 h-5 rounded border-2 border-dashed border-fg-faint/20" />
      </div>
    </div>
    <p v-if="selectedLabel" class="text-[11px] text-fg-faint mt-2">
      {{ $t('settings.selected') }}
      <span class="text-fg-base font-medium">{{ selectedLabel }}</span>
    </p>
  </div>
</template>
