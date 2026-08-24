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
  <div class="flex items-center gap-1 bg-neutral rounded-field p-0.5">
    <button
      v-for="m in modes"
      :key="m.id"
      class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
      :class="
        mode === m.id
          ? 'bg-primary text-primary-content'
          : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
      "
      :title="m.tip"
      @click="emit('update:mode', m.id)"
    >
      <component :is="m.icon" :size="14" />
    </button>
  </div>
</template>
