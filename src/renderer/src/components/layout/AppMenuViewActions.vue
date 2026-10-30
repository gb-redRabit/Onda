<script setup lang="ts">
import { Search } from '@lucide/vue';

// Jedno pole wyszukiwania w pasku tytułu: globalna paleta poleceń (Ctrl+K).
// Wyszukiwanie w bieżącym widoku zostaje pod Ctrl+F i w paskach widoków.
defineProps<{
  show: boolean;
  shortcut: string;
}>();

const emit = defineEmits<{
  search: [];
}>();
</script>

<template>
  <div v-if="show" class="flex min-w-0 flex-1 items-center justify-center px-3">
    <button
      class="flex h-7 w-full max-w-md items-center gap-2 rounded-field border border-base-300/70 bg-base-200/50 px-2.5 text-left text-[12px] text-base-content/55 transition-colors hover:border-base-content/25 hover:bg-base-content/8 hover:text-base-content focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
      style="-webkit-app-region: no-drag"
      data-testid="titlebar-search"
      :title="$t('menu.search') + (shortcut ? ' (' + shortcut + ')' : '')"
      :aria-label="$t('menu.search')"
      @click="emit('search')"
    >
      <Search :size="13" class="shrink-0" />
      <span class="truncate">{{ $t('menu.search') }}</span>
      <kbd
        v-if="shortcut"
        class="ml-auto shrink-0 rounded border border-base-300/70 px-1 font-mono text-3xs text-base-content/45"
        >{{ shortcut }}</kbd
      >
    </button>
  </div>
</template>
