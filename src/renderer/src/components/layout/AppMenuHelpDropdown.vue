<script setup lang="ts">
import { BookOpen, FileText, Info, Package, RefreshCw } from '@lucide/vue';
import AppMenuItem from './AppMenuItem.vue';

const emit = defineEmits<{
  about: [];
  shortcuts: [];
  dependencies: [];
  updates: [];
  logs: [];
}>();
</script>

<template>
  <div
    role="menu"
    data-menu="help"
    class="absolute top-full left-0 mt-1 bg-base-100 border border-hairline rounded-box shadow-2xl shadow-scrim/40 py-2 min-w-56 z-70"
  >
    <AppMenuItem :icon="BookOpen" @click="emit('shortcuts')">
      {{ $t('menu.shortcuts') }}
    </AppMenuItem>
    <AppMenuItem :icon="Package" @click="emit('dependencies')">
      {{ $t('menu.dependencies') }}
    </AppMenuItem>
    <AppMenuItem :icon="RefreshCw" @click="emit('updates')">
      {{ $t('menu.updates') }}
    </AppMenuItem>
    <AppMenuItem :icon="FileText" @click="emit('logs')">
      {{ $t('menu.logs') }}
    </AppMenuItem>
    <div class="border-t border-hairline my-1.5 mx-2" role="separator" />
    <AppMenuItem :icon="Info" @click="emit('about')">
      {{ $t('menu.about') }}
    </AppMenuItem>
  </div>
</template>
