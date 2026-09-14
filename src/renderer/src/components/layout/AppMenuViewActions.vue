<script setup lang="ts">
import { Search, FileAudio, FolderOpen } from '@lucide/vue';

defineProps<{
  show: boolean;
  label: string;
  searchable: boolean;
}>();

const emit = defineEmits<{
  openFile: [];
  openFolder: [];
  search: [];
}>();
</script>

<template>
  <div v-if="show" class="flex items-center gap-1 px-2 flex-1 min-w-0">
    <span class="text-xs font-medium text-base-content mr-2 truncate">{{ label }}</span>

    <template v-if="$route.name === 'home'">
      <button
        class="fx-noise h-7 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 fx-depth rounded-field transition-colors flex items-center gap-1.5"
        style="-webkit-app-region: no-drag"
        @click="emit('openFile')"
      >
        <FileAudio :size="12" /> {{ $t('home.openFile') }}
      </button>
      <button
        class="fx-noise h-7 px-2.5 text-xs text-base-content/70 hover:text-base-content hover:bg-base-content/10 fx-depth rounded-field transition-colors flex items-center gap-1.5"
        style="-webkit-app-region: no-drag"
        @click="emit('openFolder')"
      >
        <FolderOpen :size="12" /> {{ $t('home.openFolder') }}
      </button>
    </template>
    <button
      v-if="searchable"
      class="h-9 px-2 flex items-center hover:bg-base-content/10 transition-colors text-base-content/60 hover:text-base-content"
      style="-webkit-app-region: no-drag"
      :title="$t('menu.viewSearch')"
      @click="emit('search')"
    >
      <Search :size="12" />
    </button>
  </div>
</template>
