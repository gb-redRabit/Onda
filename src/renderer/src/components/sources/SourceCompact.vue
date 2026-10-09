<script setup lang="ts">
import { Image, Play, Music2, File, Download, Check } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

// Gęsta lista (tryb „Compact"): wiersz z miniaturą, tytułem, czasem i pobieraniem.
// Działa dla listy elementów poziomu oraz dla wierszy tabeli strony.
defineProps<{
  items: SourceItem[];
  downloadable?: boolean;
  downloadedIds?: Set<string>;
  downloadingItem?: SourceItem | null;
  /** Tryb zaznaczania zbiorczego — klik zaznacza zamiast otwierać podgląd. */
  selectable?: boolean;
  selectedIds?: Set<string>;
}>();

const emit = defineEmits<{
  activate: [item: SourceItem];
  download: [item: SourceItem];
  select: [item: SourceItem, event: MouseEvent];
}>();

const typeIcon = {
  image: Image,
  video: Play,
  audio: Music2,
  file: File
} as const;
</script>

<template>
  <div class="space-y-1" data-testid="sources-compact">
    <div
      v-for="(item, i) in items"
      :key="item.id || `${i}`"
      v-activate
      class="group flex items-center gap-3 px-2 py-1.5 rounded-field cursor-pointer transition-colors hover:bg-base-content/5"
      :class="selectable && item.id && selectedIds?.has(item.id) ? 'ring-1 ring-primary' : ''"
      :title="item.title"
      @click="selectable ? emit('select', item, $event) : emit('activate', item)"
    >
      <span
        v-if="selectable"
        class="w-5 h-5 shrink-0 rounded-field flex items-center justify-center border"
        :class="
          item.id && selectedIds?.has(item.id)
            ? 'bg-primary border-primary text-primary-content'
            : 'border-base-content/30 text-transparent'
        "
        aria-hidden="true"
      >
        <Check :size="12" />
      </span>
      <span class="w-12 h-8 shrink-0 rounded-field overflow-hidden bg-neutral">
        <img
          v-if="item.thumbnail"
          :src="item.thumbnail"
          :alt="item.title"
          loading="lazy"
          class="w-full h-full object-cover"
        />
        <span v-else class="w-full h-full flex items-center justify-center text-base-content/50">
          <component :is="typeIcon[item.type]" :size="14" />
        </span>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-xs font-medium truncate">{{
          item.title || $t('sources.untitled')
        }}</span>
        <span v-if="item.subtitle" class="block text-[11px] text-base-content/50 truncate">{{
          item.subtitle
        }}</span>
      </span>
      <span v-if="item.duration" class="shrink-0 text-[11px] font-mono text-base-content/50">{{
        item.duration
      }}</span>
      <button
        v-if="downloadable && (item.mediaUrl || item.playerUrl)"
        class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 fx-depth rounded-field text-[10px] transition-colors disabled:opacity-60"
        :class="
          item.id && downloadedIds?.has(item.id)
            ? 'bg-success text-success-content'
            : 'bg-base-100 border border-base-300 text-base-content/70 hover:bg-base-content/10'
        "
        :disabled="!!(item.id && downloadedIds?.has(item.id)) || downloadingItem === item"
        :title="
          item.id && downloadedIds?.has(item.id) ? $t('sources.downloaded') : $t('sources.download')
        "
        @click.stop="emit('download', item)"
      >
        <Check v-if="item.id && downloadedIds?.has(item.id)" :size="11" />
        <Download v-else :size="11" />
      </button>
    </div>
  </div>
</template>
