<script setup lang="ts">
import { Search } from '@lucide/vue';

defineProps<{
  show: boolean;
  label: string;
  searchable: boolean;
}>();

const emit = defineEmits<{
  search: [];
}>();
</script>

<template>
  <div v-if="show" class="flex items-center gap-1.5 px-3 flex-1 min-w-0">
    <span class="text-[12px] font-medium tracking-wide text-base-content/55 mr-1 truncate">
      {{ label }}
    </span>

    <button
      v-if="searchable"
      class="h-7 w-7 grid place-items-center rounded-field hover:bg-base-content/8 transition-colors text-base-content/55 hover:text-base-content focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
      style="-webkit-app-region: no-drag"
      :title="$t('menu.viewSearch')"
      :aria-label="$t('menu.viewSearch')"
      @click="emit('search')"
    >
      <Search :size="14" />
    </button>
  </div>
</template>
