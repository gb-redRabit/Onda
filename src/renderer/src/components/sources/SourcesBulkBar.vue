<script setup lang="ts">
import { Download, ListPlus, Play, X } from '@lucide/vue';
import IconButton from '@renderer/components/ui/IconButton.vue';

// Pasek akcji zbiorczych w widoku Źródeł (widoczny w trybie „Zaznacz").
defineProps<{ count: number; playableCount: number }>();
const emit = defineEmits<{ download: []; queue: []; play: []; clear: [] }>();
</script>

<template>
  <div
    class="flex items-center gap-2 px-4 py-1.5 border-b border-base-300 bg-primary/10 text-xs"
    data-testid="sources-bulk-bar"
  >
    <span class="text-base-content/70 shrink-0" data-testid="sources-selected-count">{{
      $t('sources.selectedCount', { n: count })
    }}</span>
    <span class="flex-1" />
    <button
      class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors disabled:opacity-50"
      :disabled="!count"
      :title="$t('sources.downloadAll')"
      @click="emit('download')"
    >
      <Download :size="12" />
      {{ $t('sources.downloadAll') }}
    </button>
    <button
      class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors disabled:opacity-50"
      :disabled="!playableCount"
      :title="$t('sources.addToQueue')"
      @click="emit('queue')"
    >
      <ListPlus :size="12" />
      {{ $t('sources.addToQueue') }}
    </button>
    <button
      class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors disabled:opacity-50"
      :disabled="!playableCount"
      :title="$t('sources.playNow')"
      @click="emit('play')"
    >
      <Play :size="12" />
      {{ $t('sources.playNow') }}
    </button>
    <IconButton
      :icon="X"
      :label="$t('sources.clearSelection')"
      class="shrink-0"
      @click="emit('clear')"
    />
  </div>
</template>
