<script setup lang="ts">
import { Minus, Square, Maximize2, X, Search } from '@lucide/vue';
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
</script>

<template>
  <div class="flex items-center shrink-0 ml-auto" style="-webkit-app-region: no-drag">
    <button
      class="h-9 px-3 flex items-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      :title="$t('menu.search')"
      @click="ui.toggleGlobalSearch()"
    >
      <Search :size="14" />
    </button>
    <button
      class="h-9 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      @click="emit('minimize')"
    >
      <Minus :size="14" />
    </button>
    <button
      class="h-9 w-11 flex items-center justify-center hover:bg-base-content/10 transition-colors text-base-content/70 hover:text-base-content"
      @click="emit('maximize')"
    >
      <Maximize2 v-if="!isMaximized" :size="12" />
      <Square v-else :size="10" />
    </button>
    <button
      class="h-9 w-11 flex items-center justify-center hover:bg-error/80 transition-colors text-base-content/70 hover:text-error-content"
      @click="emit('close')"
    >
      <X :size="14" />
    </button>
  </div>
</template>
