<script setup lang="ts">
import { Minus, Square, Maximize2, X, Search, RectangleVertical } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';

defineProps<{
  isMaximized: boolean;
}>();

const emit = defineEmits<{
  minimize: [];
  maximize: [];
  close: [];
}>();

const ui = useUIStore();

/**
 * Przejście do compactu z górnego paska. W Core-shell to natychmiastowa podmiana
 * okna; w klasycznym mainie proces restartuje się automatycznie (jeden właściciel audio).
 */
async function openCompactMode(): Promise<void> {
  try {
    await window.api?.invoke('app:setWindowMode', 'compact');
  } catch {
    /* okno pozostaje w bieżącym trybie */
  }
}
</script>

<template>
  <div class="flex items-center shrink-0 ml-auto" style="-webkit-app-region: no-drag">
    <button
      class="h-9 px-3 flex items-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      :title="$t('window.compactMode')"
      :aria-label="$t('window.compactMode')"
      data-testid="window-switch-compact"
      @click="openCompactMode"
    >
      <RectangleVertical :size="14" />
    </button>
    <button
      class="h-9 px-3 flex items-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      :title="$t('menu.search')"
      :aria-label="$t('menu.search')"
      @click="ui.toggleGlobalSearch()"
    >
      <Search :size="14" />
    </button>
    <button
      class="h-9 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      :aria-label="$t('window.minimize')"
      @click="emit('minimize')"
    >
      <Minus :size="14" />
    </button>
    <button
      class="h-9 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      :aria-label="$t('window.maximize')"
      @click="emit('maximize')"
    >
      <Maximize2 v-if="!isMaximized" :size="12" />
      <Square v-else :size="10" />
    </button>
    <button
      class="h-9 w-11 flex items-center justify-center hover:bg-error/80 transition-colors text-base-content/70 hover:text-error-content"
      :aria-label="$t('window.close')"
      @click="emit('close')"
    >
      <X :size="14" />
    </button>
  </div>
</template>
