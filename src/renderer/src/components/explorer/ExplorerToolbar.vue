<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search, X } from '@lucide/vue';

const searchQuery = ref('');

const emit = defineEmits<{
  (e: 'search', query: string): void;
}>();

watch(searchQuery, (val) => {
  emit('search', val);
});

function clearSearch() {
  searchQuery.value = '';
}
</script>

<template>
  <div class="relative">
    <Search
      :size="14"
      class="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none"
    />
    <input
      v-model="searchQuery"
      type="text"
      :placeholder="$t('explorer.search')"
      class="w-48 pl-8 pr-7 py-1.5 text-xs rounded-lg bg-bg-elevated border border-border-default text-fg-base placeholder:text-fg-faint outline-none focus:border-accent-base focus:ring-1 focus:ring-accent-base/30 transition-colors"
    />
    <button
      v-if="searchQuery"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
      @click="clearSearch"
    >
      <X :size="12" />
    </button>
  </div>
</template>
