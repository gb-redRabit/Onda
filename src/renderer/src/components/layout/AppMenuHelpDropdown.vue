<script setup lang="ts">
import { Info, BookOpen } from '@lucide/vue';
import AppMenuItem from './AppMenuItem.vue';

const emit = defineEmits<{
  about: [];
  shortcuts: [];
}>();
</script>

<template>
  <div
    role="menu"
    data-menu="help"
    class="absolute top-full left-0 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-2xl shadow-black/40 py-2 min-w-56 z-[70]"
  >
    <AppMenuItem :icon="BookOpen" @click="emit('shortcuts')">
      {{ $t('menu.documentation') }}
    </AppMenuItem>
    <div class="border-t border-base-300 my-1.5 mx-2" role="separator" />
    <AppMenuItem :icon="Info" @click="emit('about')">
      {{ $t('menu.about') }}
    </AppMenuItem>
  </div>
</template>
