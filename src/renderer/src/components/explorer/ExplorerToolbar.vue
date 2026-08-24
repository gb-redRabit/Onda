<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search, X } from '@lucide/vue';

const searchQuery = ref('');

const emit = defineEmits<{
  (e: 'search', query: string): void;
}>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => emit('search', val), 150);
});

function clearSearch() {
  searchQuery.value = '';
}
</script>

<template>
  <div class="relative">
    <Search
      :size="14"
      class="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/50 pointer-events-none"
    />
    <input
      v-model="searchQuery"
      type="text"
      :placeholder="$t('explorer.search')"
      class="w-48 pl-8 pr-7 py-1.5 text-xs fx-depth rounded-field bg-base-100 border border-base-300 text-base-content placeholder:text-base-content/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
    />
    <button
      v-if="searchQuery"
      class="fx-noise absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
      @click="clearSearch"
    >
      <X :size="12" />
    </button>
  </div>
</template>
