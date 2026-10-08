<script setup lang="ts">
import { computed, ref, watch, type ComponentPublicInstance } from 'vue';
import {
  Image,
  Play,
  Music2,
  File,
  Download,
  Check,
  ExternalLink,
  Maximize2,
  MonitorPlay
} from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';
import { openPreviewWindow } from '@renderer/utils/previewWindow';
import { useVirtualList } from '@renderer/composables/useVirtualList';
import EmbedWebview from './EmbedWebview.vue';

// Widok „player": duży odtwarzacz/podgląd wybranej pozycji + lista po prawej.
// Przystosowany do treści wideo/obrazów (media dominują, lista jest pomocnicza).
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

const selected = ref<SourceItem | null>(null);

watch(
  () => props.items,
  (list) => {
    if (!selected.value || !list.includes(selected.value)) selected.value = list[0] ?? null;
  },
  { immediate: true }
);

// Prawa lista jest wirtualizowana pionowo (odcinki serii bywają długie).
const asideRef = ref<HTMLElement | null>(null);
const listVirtual = useVirtualList({
  count: () => props.items.length,
  scrollEl: () => asideRef.value,
  estimateSize: () => 60,
  overscan: 6
});
const listCells = computed(() =>
  listVirtual.value
    .getVirtualItems()
    .map((row) => ({ index: row.index, start: row.start, item: props.items[row.index] }))
    .filter((cell): cell is { index: number; start: number; item: SourceItem } => !!cell.item)
);
function measureRow(node: Element | ComponentPublicInstance | null): void {
  if (node instanceof HTMLElement) listVirtual.value.measureElement(node);
}

const typeIcon = {
  image: Image,
  video: Play,
  audio: Music2,
  file: File
} as const;

const current = computed(() => selected.value);
const isDownloaded = computed(
  () => !!current.value?.id && (props.downloadedIds?.has(current.value.id) ?? false)
);
function mediaUrl(item: SourceItem | null): string {
  return item?.mediaUrl || item?.sourceUrl || '';
}
function browserUrl(item: SourceItem | null): string {
  return item?.playerUrl || item?.sourceUrl || item?.mediaUrl || '';
}
</script>

<template>
  <div class="flex h-full min-h-0" data-testid="sources-player">
    <!-- Scena -->
    <div class="flex-1 min-w-0 flex flex-col bg-neutral/40">
      <div
        class="flex-1 min-h-0 overflow-hidden"
        :class="current?.playerUrl ? '' : 'flex items-center justify-center p-4'"
      >
        <img
          v-if="current?.type === 'image' && mediaUrl(current)"
          :src="mediaUrl(current)"
          :alt="current.title"
          class="w-full h-full object-contain"
        />
        <video
          v-else-if="current?.type === 'video' && mediaUrl(current)"
          :src="mediaUrl(current)"
          controls
          class="w-full h-full object-contain bg-black"
        />
        <audio
          v-else-if="current?.type === 'audio' && mediaUrl(current)"
          :src="mediaUrl(current)"
          controls
          class="w-full"
        />
        <EmbedWebview
          v-else-if="current?.playerUrl"
          :src="current.playerUrl"
          :title="current.title"
          class="w-full h-full"
        />
        <a
          v-else-if="current"
          :href="browserUrl(current)"
          target="_blank"
          rel="noreferrer"
          class="text-sm text-primary hover:underline flex items-center gap-1"
        >
          {{ $t('sources.openInBrowser') }}
          <ExternalLink :size="14" />
        </a>
        <p v-else role="status" class="text-sm text-base-content/50">{{ $t('sources.noItems') }}</p>
      </div>

      <div
        v-if="current"
        class="shrink-0 flex items-center gap-3 px-4 py-3 border-t border-base-300 bg-base-100"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">{{ current.title || $t('sources.untitled') }}</p>
          <p v-if="current.subtitle" class="text-xs text-base-content/50 truncate mt-0.5">
            {{ current.subtitle }}
          </p>
        </div>
        <button
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-base-200 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors"
          :title="$t('sources.openInModal')"
          @click="emit('activate', current)"
        >
          <Maximize2 :size="13" />
          {{ $t('sources.openInModal') }}
        </button>
        <button
          v-if="current.playerUrl"
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-base-200 border border-base-300 text-xs text-base-content/80 hover:bg-base-content/10 transition-colors"
          :title="$t('sources.openInPreview')"
          @click="openPreviewWindow(current.playerUrl, current.title)"
        >
          <MonitorPlay :size="13" />
          {{ $t('sources.openInPreview') }}
        </button>
        <button
          v-if="downloadable && (current.mediaUrl || current.playerUrl)"
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors disabled:opacity-70"
          :class="
            isDownloaded
              ? 'bg-success text-success-content'
              : 'bg-primary text-primary-content hover:bg-primary/90'
          "
          :disabled="isDownloaded || props.downloadingItem === current"
          @click="emit('download', current)"
        >
          <Check v-if="isDownloaded" :size="13" />
          <Download v-else :size="13" />
          {{ isDownloaded ? $t('sources.downloaded') : $t('sources.download') }}
        </button>
      </div>
    </div>

    <!-- Lista -->
    <aside
      ref="asideRef"
      class="w-72 max-lg:w-60 shrink-0 border-l border-base-300 overflow-y-auto"
    >
      <div class="relative w-full" :style="{ height: listVirtual.getTotalSize() + 'px' }">
        <button
          v-for="cell in listCells"
          :key="cell.item.id || cell.index"
          :ref="measureRow"
          :data-index="cell.index"
          class="fx-noise absolute top-0 left-0 w-full flex items-center gap-2 px-2.5 py-2 text-left border-b border-base-200 transition-colors"
          :class="cell.item === current ? 'bg-primary/15' : 'hover:bg-base-content/5'"
          :style="{ transform: `translateY(${cell.start}px)` }"
          :title="cell.item.title"
          @click="selected = cell.item"
        >
          <span class="w-16 h-10 shrink-0 rounded-field overflow-hidden bg-neutral">
            <img
              v-if="cell.item.thumbnail"
              :src="cell.item.thumbnail"
              :alt="cell.item.title"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <span
              v-else
              class="w-full h-full flex items-center justify-center text-base-content/50"
            >
              <component :is="typeIcon[cell.item.type]" :size="16" />
            </span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium line-clamp-2">{{
              cell.item.title || $t('sources.untitled')
            }}</span>
            <span
              v-if="cell.item.subtitle"
              class="block text-[10px] text-base-content/50 truncate"
              >{{ cell.item.subtitle }}</span
            >
          </span>
          <Check
            v-if="cell.item.id && downloadedIds?.has(cell.item.id)"
            :size="12"
            class="shrink-0 text-success"
          />
        </button>
      </div>
    </aside>
  </div>
</template>
