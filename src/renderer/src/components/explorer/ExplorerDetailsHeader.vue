<script setup lang="ts">
import { ChevronUp, ChevronDown } from '@lucide/vue';
import type { SortBy, SortOrder } from '@renderer/types/explorer';

const props = defineProps<{
  sortBy: SortBy;
  sortOrder: SortOrder;
}>();

const emit = defineEmits<{
  sort: [field: SortBy];
}>();

const columns: { field: SortBy; labelKey: string; align?: 'right' }[] = [
  { field: 'name', labelKey: 'explorer.name' },
  { field: 'size', labelKey: 'explorer.size' },
  { field: 'type', labelKey: 'explorer.type' },
  { field: 'modified', labelKey: 'explorer.modified', align: 'right' }
];

function isActive(field: SortBy): boolean {
  return props.sortBy === field;
}
</script>

<template>
  <div
    class="grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 text-[11px] text-base-content/50 font-medium uppercase tracking-wider border-b border-base-300 mb-1 sticky top-0 bg-base-200/[var(--glass-alpha)] z-10"
  >
    <button
      v-for="col in columns"
      :key="col.field"
      class="flex items-center gap-1 hover:text-base-content"
      :class="col.align === 'right' ? 'text-right justify-end' : 'text-left'"
      @click="emit('sort', col.field)"
    >
      {{ $t(col.labelKey)
      }}<ChevronUp v-if="isActive(col.field) && props.sortOrder === 'asc'" :size="10" /><ChevronDown
        v-if="isActive(col.field) && props.sortOrder === 'desc'"
        :size="10"
      />
    </button>
  </div>
</template>
