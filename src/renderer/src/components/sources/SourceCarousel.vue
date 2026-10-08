<script setup lang="ts">
import { computed, ref } from 'vue';
import { Image, Play, Music2, File, Download, Check } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';
import { useVirtualList } from '@renderer/composables/useVirtualList';

// Pozioma karuzela elementów — alternatywa dla tabeli/siatki, dobra do pokazywania
// okładek i szybkiego przeglądania wielu pozycji bez pionowego przewijania.
// Zawartość jest wirtualizowana poziomo, więc duże listy nie montują wszystkich
// kafelków naraz.
const props = defineProps<{
  items: SourceItem[];
  downloadable?: boolean;
  downloadedIds?: Set<string>;
  downloadingItem?: SourceItem | null;
}>();

const emit = defineEmits<{
  activate: [item: SourceItem];
  download: [item: SourceItem];
}>();

const typeIcon = {
  image: Image,
  video: Play,
  audio: Music2,
  file: File
} as const;

const scrollRef = ref<HTMLElement | null>(null);
// Krok kafelka = szerokość (w-56 = 224 px) + odstęp (12 px).
const CARD_STEP = 236;
const virtual = useVirtualList({
  count: () => props.items.length,
  scrollEl: () => scrollRef.value,
  estimateSize: () => CARD_STEP,
  horizontal: true,
  overscan: 3
});

const cells = computed(() =>
  virtual.value
    .getVirtualItems()
    .map((row) => ({ index: row.index, start: row.start, item: props.items[row.index] }))
    .filter((cell): cell is { index: number; start: number; item: SourceItem } => !!cell.item)
);
</script>

<template>
  <div ref="scrollRef" class="overflow-x-auto p-4 pb-5 snap-x" data-testid="sources-carousel">
    <div class="relative h-[260px]" :style="{ width: virtual.getTotalSize() + 'px' }">
      <div
        v-for="cell in cells"
        :key="cell.item.id || cell.index"
        :data-index="cell.index"
        class="absolute top-0 left-0 snap-start"
        :style="{ transform: `translateX(${cell.start}px)` }"
      >
        <div
          v-activate
          class="group w-56 max-lg:w-48 cursor-pointer fx-depth rounded-box fx-noise overflow-hidden bg-base-100 border border-base-300 hover:border-primary/50 transition-colors"
          :title="cell.item.title"
          @click="emit('activate', cell.item)"
        >
          <div class="relative aspect-video bg-neutral">
            <img
              v-if="cell.item.thumbnail"
              :src="cell.item.thumbnail"
              :alt="cell.item.title"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-base-content/50">
              <component :is="typeIcon[cell.item.type]" :size="28" />
            </div>
            <div
              v-if="cell.item.playerUrl || cell.item.type === 'video'"
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
              data-testid="source-playable"
            >
              <span
                class="flex items-center justify-center w-9 h-9 rounded-full bg-neutral/70 text-neutral-content"
              >
                <Play :size="16" />
              </span>
            </div>
            <div
              v-if="cell.item.duration"
              class="absolute bottom-1.5 right-1.5 bg-neutral/80 text-neutral-content text-[10px] px-1.5 py-0.5 rounded-field"
            >
              {{ cell.item.duration }}
            </div>
            <div
              v-if="cell.item.id && downloadedIds?.has(cell.item.id)"
              class="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-field bg-success text-success-content text-[10px]"
              :title="$t('sources.downloaded')"
            >
              <Check :size="10" />
            </div>
          </div>
          <div class="px-2.5 py-2">
            <p class="text-xs font-medium line-clamp-2">
              {{ cell.item.title || $t('sources.untitled') }}
            </p>
            <p v-if="cell.item.subtitle" class="text-[11px] text-base-content/50 truncate mt-0.5">
              {{ cell.item.subtitle }}
            </p>
          </div>
          <button
            v-if="downloadable && (cell.item.mediaUrl || cell.item.playerUrl)"
            class="fx-noise m-2 flex items-center justify-center gap-1 py-1 fx-depth rounded-field text-[10px] text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-60"
            :disabled="
              !!(cell.item.id && downloadedIds?.has(cell.item.id)) || downloadingItem === cell.item
            "
            :title="
              cell.item.id && downloadedIds?.has(cell.item.id)
                ? $t('sources.downloaded')
                : $t('sources.download')
            "
            @click.stop="emit('download', cell.item)"
          >
            <Check v-if="cell.item.id && downloadedIds?.has(cell.item.id)" :size="11" />
            <Download v-else :size="11" />
            {{
              cell.item.id && downloadedIds?.has(cell.item.id)
                ? $t('sources.downloaded')
                : $t('sources.download')
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
