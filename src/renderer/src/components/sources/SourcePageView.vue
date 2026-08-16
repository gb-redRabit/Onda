<script setup lang="ts">
import { Download, ListVideo, Loader2 } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

defineProps<{
  item: SourceItem | null;
  rows: SourceItem[];
  rowLoading?: boolean;
  rowClickable?: boolean;
  /** Poziom ma skonfigurowane pole pobierania — bez tego przycisk Pobierz się nie pojawia. */
  downloadable?: boolean;
}>();

const emit = defineEmits<{
  'row-click': [item: SourceItem];
  download: [item: SourceItem];
  'download-all': [rows: SourceItem[]];
}>();
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4">
    <div class="flex gap-4 rounded-xl border border-border-default bg-bg-elevated/40 p-4">
      <div class="w-56 shrink-0 rounded-lg overflow-hidden bg-bg-elevated">
        <img
          v-if="item?.thumbnail"
          :src="item.thumbnail"
          :alt="item.title"
          loading="lazy"
          class="w-full aspect-video object-cover"
        />
        <div v-else class="w-full aspect-video flex items-center justify-center bg-bg-overlay" />
      </div>
      <div class="flex-1 min-w-0 flex flex-col gap-2">
        <h2 class="text-base font-semibold leading-snug">
          {{ item?.title || $t('sources.untitled') }}
        </h2>
        <p v-if="item?.subtitle" class="text-xs text-fg-faint">{{ item.subtitle }}</p>
        <p v-if="item?.duration" class="text-xs text-fg-faint">{{ item.duration }}</p>
        <div class="flex-1" />
        <div v-if="downloadable && (item?.mediaUrl || item?.playerUrl)" class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-strong transition-colors"
            :title="$t('sources.download')"
            @click="emit('download', item)"
          >
            <Download :size="13" />
            {{ $t('sources.download') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="rows.length || rowLoading" class="space-y-2">
      <div class="flex items-center gap-2">
        <ListVideo :size="14" class="text-fg-faint" />
        <h3 class="text-xs font-medium text-fg-faint uppercase tracking-wider">
          {{ $t('sources.episodes') }}
        </h3>
        <Loader2 v-if="rowLoading" :size="12" class="animate-spin text-fg-faint" />
        <div class="flex-1" />
        <button
          v-if="downloadable && rows.length"
          class="flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-[10px] text-fg-muted hover:bg-bg-hover transition-colors"
          :title="$t('sources.downloadAllRows')"
          @click="emit('download-all', rows)"
        >
          <Download :size="11" />
          {{ $t('sources.downloadAllRows') }}
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        <button
          v-for="(row, i) in rows"
          :key="row.id || `${i}`"
          class="group text-left rounded-xl overflow-hidden bg-bg-elevated border border-border-default hover:border-accent-base/50 transition-colors"
          :disabled="!rowClickable"
          :title="row.title"
          @click="emit('row-click', row)"
        >
          <div class="relative aspect-video bg-bg-overlay">
            <img
              v-if="row.thumbnail"
              :src="row.thumbnail"
              :alt="row.title"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-bg-overlay text-fg-faint/40"
            >
              <ListVideo :size="24" />
            </div>
          </div>
          <div class="px-2.5 py-2">
            <p class="text-xs font-medium line-clamp-2">
              {{ row.title || $t('sources.untitled') }}
            </p>
          </div>
        </button>
      </div>
      <p v-if="!rows.length && !rowLoading" class="text-xs text-fg-faint">
        {{ $t('sources.noTableRows') }}
      </p>
    </div>

    <div v-else class="flex items-center justify-center py-8 text-xs text-fg-faint">
      {{ $t('sources.noTableRows') }}
    </div>
  </div>
</template>
