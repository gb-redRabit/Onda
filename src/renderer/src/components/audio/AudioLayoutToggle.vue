<script setup lang="ts">
import { LayoutGrid, Maximize, AlignVerticalSpaceAround } from '@lucide/vue';

defineProps<{
  mode: 'split' | 'full' | 'stacked';
}>();

const emit = defineEmits<{
  'update:mode': [value: 'split' | 'full' | 'stacked'];
}>();

const modes = [
  { id: 'split' as const, icon: LayoutGrid, tip: 'Split' },
  { id: 'full' as const, icon: Maximize, tip: 'Full' },
  { id: 'stacked' as const, icon: AlignVerticalSpaceAround, tip: 'Stacked' }
];
</script>

<template>
  <div class="flex items-center gap-1 bg-bg-overlay rounded-lg p-0.5">
    <button
      v-for="m in modes"
      :key="m.id"
      class="p-1.5 rounded-md transition-colors"
      :class="
        mode === m.id
          ? 'bg-accent-base text-white'
          : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
      "
      :title="m.tip"
      @click="emit('update:mode', m.id)"
    >
      <component :is="m.icon" :size="14" />
    </button>
  </div>
</template>
