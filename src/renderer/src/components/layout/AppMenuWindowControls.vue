<script setup lang="ts">
import { Minus, Square, Maximize2, X, Search, RectangleVertical } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import { useCompactSwitch } from '@renderer/composables/useCompactSwitch';

defineProps<{
  isMaximized: boolean;
}>();

const emit = defineEmits<{
  minimize: [];
  maximize: [];
  close: [];
}>();

const ui = useUIStore();
const { switching, switchToCompact } = useCompactSwitch();
</script>

<template>
  <div class="flex items-center shrink-0 ml-auto h-10" style="-webkit-app-region: no-drag">
    <div class="w-px h-4 bg-base-300/70 mx-1" role="separator" aria-orientation="vertical" />
    <button
      class="h-8 my-1 px-3 flex items-center rounded-lg hover:bg-base-content/10 transition-colors text-base-content/60 hover:text-base-content disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :disabled="switching"
      :title="$t('window.compactMode')"
      :aria-label="$t('window.compactMode')"
      data-testid="window-switch-compact"
      @click="switchToCompact"
    >
      <RectangleVertical :size="15" />
    </button>
    <button
      class="h-8 my-1 px-3 flex items-center rounded-lg hover:bg-base-content/10 transition-colors text-base-content/60 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :title="$t('menu.search')"
      :aria-label="$t('menu.search')"
      @click="ui.toggleGlobalSearch()"
    >
      <Search :size="15" />
    </button>
    <div class="w-px h-4 bg-base-300/70 mx-1" role="separator" aria-orientation="vertical" />
    <button
      class="h-10 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/60 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :aria-label="$t('window.minimize')"
      @click="emit('minimize')"
    >
      <Minus :size="15" />
    </button>
    <button
      class="h-10 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/60 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :aria-label="$t('window.maximize')"
      @click="emit('maximize')"
    >
      <Maximize2 v-if="!isMaximized" :size="13" />
      <Square v-else :size="11" />
    </button>
    <button
      class="h-10 w-11 flex items-center justify-center hover:bg-error/85 transition-colors text-base-content/60 hover:text-error-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
      :aria-label="$t('window.close')"
      @click="emit('close')"
    >
      <X :size="15" />
    </button>
  </div>
</template>
