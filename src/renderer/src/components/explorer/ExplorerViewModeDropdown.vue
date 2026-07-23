<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { LayoutGrid, List } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';

const explorer = useExplorerStore();

const VIEW_MODES_LIST = [
  { key: 'extraSmall' as const, icon: List, label: 'ExtraSmall' },
  { key: 'small' as const, icon: LayoutGrid, label: 'Small' },
  { key: 'medium' as const, icon: LayoutGrid, label: 'Medium' },
  { key: 'large' as const, icon: LayoutGrid, label: 'Large' },
  { key: 'extraLarge' as const, icon: LayoutGrid, label: 'ExtraLarge' },
  { key: 'details' as const, icon: List, label: 'Details' },
];

const viewModeOpen = ref(false);
const viewModeRef = ref<HTMLElement | null>(null);

function handleClickOutside(e: MouseEvent) {
  if (viewModeRef.value && !viewModeRef.value.contains(e.target as Node)) {
    viewModeOpen.value = false;
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside));
</script>

<template>
  <div ref="viewModeRef" class="relative">
    <button class="p-1.5 rounded-lg transition-colors text-fg-faint hover:text-fg-base hover:bg-bg-hover" @click="viewModeOpen = !viewModeOpen" :title="$t('explorer.viewMode')">
      <component :is="explorer.viewMode === 'details' ? List : LayoutGrid" :size="14" class="pointer-events-none" />
    </button>
    <div v-if="viewModeOpen" class="absolute top-full right-0 mt-1 bg-bg-elevated border border-border-default rounded-xl shadow-2xl z-30 py-1 min-w-[140px]" @mouseleave="viewModeOpen = false">
      <button v-for="mode in VIEW_MODES_LIST" :key="mode.key" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors whitespace-nowrap" :class="explorer.viewMode === mode.key ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'" @click="explorer.setViewMode(mode.key); viewModeOpen = false">
        <component :is="mode.icon" :size="12" class="pointer-events-none" />
        <span>{{ $t('explorer.view' + mode.label) }}</span>
      </button>
    </div>
  </div>
</template>
