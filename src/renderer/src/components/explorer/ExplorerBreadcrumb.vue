<script setup lang="ts">
import { ChevronLeft, ChevronRight, ChevronUp, Home } from '@lucide/vue';
import { useExplorerStore } from '@renderer/stores/explorer';

const explorer = useExplorerStore();
</script>

<template>
  <div class="flex gap-0.5">
    <button class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors" :disabled="!explorer.canGoBack" @click="explorer.goBack"><ChevronLeft :size="16" class="pointer-events-none" /></button>
    <button class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors" :disabled="!explorer.canGoForward" @click="explorer.goForward"><ChevronRight :size="16" class="pointer-events-none" /></button>
    <button class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors" :disabled="!explorer.canGoUp" @click="explorer.goUp"><ChevronUp :size="16" class="pointer-events-none" /></button>
  </div>
  <div class="flex-1 flex items-center gap-0.5 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs overflow-hidden">
    <button class="shrink-0 p-0.5 text-fg-faint hover:text-fg-base transition-colors" @click="explorer.navigateTo('')"><Home :size="12" class="pointer-events-none" /></button>
    <template v-if="explorer.currentPath">
      <template v-for="(part, idx) in explorer.currentPath.split('\\').filter(Boolean)" :key="idx">
        <span v-if="idx > 0" class="text-fg-faint">\</span>
        <button class="px-1 py-0.5 rounded hover:bg-bg-hover text-fg-muted hover:text-fg-base transition-colors truncate max-w-30" @click="explorer.navigateTo(explorer.currentPath.split('\\').filter(Boolean).slice(0, idx + 1).join('\\'))">{{ part }}</button>
      </template>
    </template>
    <span v-else class="text-fg-faint px-1">{{ $t('explorer.thisComputer') }}</span>
  </div>
</template>
