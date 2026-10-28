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
  <div v-if="show" class="flex items-center gap-1.5 px-3 flex-1 min-w-0">
    <span class="text-[12px] font-semibold tracking-wide text-base-content/80 mr-1.5 truncate">
      {{ label }}
    </span>

    <template v-if="$route.name === 'home'">
      <button
        class="fx-noise h-8 px-2.5 text-[12px] font-medium text-base-content/70 hover:text-base-content hover:bg-base-content/10 fx-depth rounded-lg transition-colors flex items-center gap-1.5"
        style="-webkit-app-region: no-drag"
        @click="emit('openFile')"
      >
        <FileAudio :size="13" /> {{ $t('home.openFile') }}
      </button>
      <button
        class="fx-noise h-8 px-2.5 text-[12px] font-medium text-base-content/70 hover:text-base-content hover:bg-base-content/10 fx-depth rounded-lg transition-colors flex items-center gap-1.5"
        style="-webkit-app-region: no-drag"
        @click="emit('openFolder')"
      >
        <FolderOpen :size="13" /> {{ $t('home.openFolder') }}
      </button>
    </template>
    <button
      v-if="searchable"
      class="h-8 px-2.5 flex items-center rounded-lg hover:bg-base-content/10 transition-colors text-base-content/55 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style="-webkit-app-region: no-drag"
      :title="$t('menu.viewSearch')"
      :aria-label="$t('menu.viewSearch')"
      @click="emit('search')"
    >
      <Search :size="14" />
    </button>
  </div>
</template>
