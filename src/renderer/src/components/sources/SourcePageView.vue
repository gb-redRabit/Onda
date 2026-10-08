<script setup lang="ts">
import { Download, ListVideo, Loader2, Check } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';
import type { SourceViewMode } from '@renderer/utils/sourcesView';
import SourceCarousel from './SourceCarousel.vue';
import SourcePlayerView from './SourcePlayerView.vue';
import SourceCompact from './SourceCompact.vue';
import SourceGalleryTile from './SourceGalleryTile.vue';

const props = defineProps<{
  item: SourceItem | null;
  rows: SourceItem[];
  viewMode?: SourceViewMode;
  rowLoading?: boolean;
  rowClickable?: boolean;
  /** Poziom ma skonfigurowane pole pobierania — bez tego przycisk Pobierz się nie pojawia. */
  downloadable?: boolean;
  /** Strona o tym API id została już pobrana. */
  downloaded?: boolean;
  /** Tryb zaznaczania zbiorczego — klik wiersza zaznacza zamiast nawigować. */
  selectable?: boolean;
  selectedIds?: Set<string>;
}>();

const emit = defineEmits<{
  'row-click': [item: SourceItem];
  download: [item: SourceItem];
  'download-all': [rows: SourceItem[]];
  select: [item: SourceItem, event: MouseEvent];
}>();

function isRowSelected(item: SourceItem): boolean {
  return !!item.id && !!props.selectedIds?.has(item.id);
}
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4">
    <div class="flex gap-4 rounded-box border border-base-300 bg-base-100 p-4">
      <div class="w-56 shrink-0 rounded-field overflow-hidden bg-base-100">
        <img
          v-if="item?.thumbnail"
          :src="item.thumbnail"
          :alt="item.title"
          loading="lazy"
          class="w-full aspect-video object-cover"
        />
        <div v-else class="w-full aspect-video flex items-center justify-center bg-neutral" />
      </div>
      <div class="flex-1 min-w-0 flex flex-col gap-2">
        <h2 class="text-base font-semibold leading-snug">
          {{ item?.title || $t('sources.untitled') }}
        </h2>
        <p v-if="item?.subtitle" class="text-xs text-base-content/50">{{ item.subtitle }}</p>
        <p v-if="item?.duration" class="text-xs text-base-content/50">{{ item.duration }}</p>
        <div class="flex-1" />
        <div
          v-if="downloadable && (item?.mediaUrl || item?.playerUrl)"
          class="flex items-center gap-2"
        >
          <button
            class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors disabled:opacity-70"
            :class="
              downloaded
                ? 'bg-success text-success-content'
                : 'bg-primary text-primary-content hover:bg-primary/90'
            "
            :disabled="downloaded"
            :title="downloaded ? $t('sources.downloaded') : $t('sources.download')"
            @click="emit('download', item)"
          >
            <Check v-if="downloaded" :size="13" />
            <Download v-else :size="13" />
            {{ downloaded ? $t('sources.downloaded') : $t('sources.download') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="rows.length || rowLoading" class="space-y-2">
      <div class="flex items-center gap-2">
        <ListVideo :size="14" class="text-base-content/50" />
        <h3 class="text-xs font-medium text-base-content/50 uppercase tracking-wider">
          {{ $t('sources.episodes') }}
        </h3>
        <Loader2 v-if="rowLoading" :size="12" class="animate-spin text-base-content/50" />
        <div class="flex-1" />
        <button
          v-if="downloadable && rows.length"
          class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-[10px] text-base-content/70 hover:bg-base-content/10 transition-colors"
          :title="$t('sources.downloadAllRows')"
          @click="emit('download-all', rows)"
        >
          <Download :size="11" />
          {{ $t('sources.downloadAllRows') }}
        </button>
      </div>
      <SourceCarousel
        v-if="viewMode === 'carousel'"
        :items="rows"
        :downloadable="downloadable"
        @activate="emit('row-click', $event)"
        @download="emit('download', $event)"
      />
      <SourcePlayerView
        v-else-if="viewMode === 'player'"
        class="min-h-[50vh] rounded-box border border-base-300 overflow-hidden"
        :items="rows"
        :downloadable="downloadable"
        @activate="emit('row-click', $event)"
        @download="emit('download', $event)"
      />
      <SourceCompact
        v-else-if="viewMode === 'compact'"
        :items="rows"
        :downloadable="downloadable"
        :selectable="selectable"
        :selected-ids="selectedIds"
        @activate="emit('row-click', $event)"
        @download="emit('download', $event)"
        @select="(it, ev) => emit('select', it, ev)"
      />
      <div
        v-else-if="viewMode === 'gallery'"
        class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      >
        <SourceGalleryTile
          v-for="(row, i) in rows"
          :key="row.id || `${i}`"
          :item="row"
          :downloadable="downloadable"
          :selectable="selectable"
          :selected="isRowSelected(row)"
          @activate="emit('row-click', $event)"
          @download="emit('download', $event)"
          @select="(it, ev) => emit('select', it, ev)"
        />
      </div>
      <div v-else class="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <button
          v-for="(row, i) in rows"
          :key="row.id || `${i}`"
          class="group relative text-left fx-depth rounded-box fx-noise overflow-hidden bg-base-100 border transition-colors"
          :class="
            isRowSelected(row)
              ? 'border-primary ring-2 ring-primary'
              : 'border-base-300 hover:border-primary/50'
          "
          :disabled="!rowClickable && !selectable"
          :title="row.title"
          @click="selectable ? emit('select', row, $event) : emit('row-click', row)"
        >
          <div class="relative aspect-video bg-neutral">
            <img
              v-if="row.thumbnail"
              :src="row.thumbnail"
              :alt="row.title"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-neutral text-neutral-content/60"
            >
              <ListVideo :size="24" />
            </div>
            <span
              v-if="selectable"
              class="absolute top-1.5 right-1.5 w-5 h-5 rounded-field flex items-center justify-center border"
              :class="
                isRowSelected(row)
                  ? 'bg-primary border-primary text-primary-content'
                  : 'bg-neutral/60 border-neutral-content/40 text-transparent'
              "
              aria-hidden="true"
            >
              <Check :size="12" />
            </span>
          </div>
          <div class="px-2.5 py-2">
            <p class="text-xs font-medium line-clamp-2">
              {{ row.title || $t('sources.untitled') }}
            </p>
          </div>
        </button>
      </div>
      <p v-if="!rows.length && !rowLoading" role="status" class="text-xs text-base-content/50">
        {{ $t('sources.noTableRows') }}
      </p>
    </div>

    <div
      v-else
      role="status"
      class="flex items-center justify-center py-8 text-xs text-base-content/50"
    >
      {{ $t('sources.noTableRows') }}
    </div>
  </div>
</template>
