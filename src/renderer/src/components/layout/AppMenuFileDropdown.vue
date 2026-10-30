<script setup lang="ts">
import { FolderOpen, FileAudio, LogOut } from '@lucide/vue';
import AppMenuItem from './AppMenuItem.vue';

defineEmits<{ openFile: []; openFolder: []; quit: [] }>();
</script>

<template>
  <div
    role="menu"
    data-menu="file"
    class="absolute top-full left-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-2xl shadow-black/40 py-2 min-w-56 z-70"
  >
    <AppMenuItem :icon="FileAudio" @click="$emit('openFile')">
      {{ $t('menu.openFile') }}
    </AppMenuItem>
    <AppMenuItem :icon="FolderOpen" @click="$emit('openFolder')">
      {{ $t('menu.openFolder') }}
    </AppMenuItem>
    <div class="border-t border-base-300 my-1.5 mx-2" role="separator" />
    <AppMenuItem :icon="LogOut" @click="$emit('quit')">{{ $t('menu.close') }}</AppMenuItem>
  </div>
</template>
