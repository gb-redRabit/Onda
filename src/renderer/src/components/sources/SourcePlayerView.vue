<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Image, Play, Music2, File, Download, Check, ExternalLink, Maximize2 } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';
import EmbedWebview from './EmbedWebview.vue';

// Widok „player": duży odtwarzacz/podgląd wybranej pozycji + lista po prawej.
// Przystosowany do treści wideo/obrazów (media dominują, lista jest pomocnicza).
const props = defineProps<{
  items: SourceItem[];
  downloadable?: boolean;
  downloadedIds?: Set<string>;
  downloadingItem?: SourceItem | null;
  selectable?: boolean;
  selectedIds?: Set<string>;
}>();

const emit = defineEmits<{
  activate: [item: SourceItem];
  download: [item: SourceItem];
  select: [item: SourceItem, event: MouseEvent];
}>();

const selected = ref<SourceItem | null>(null);

watch(
  () => props.items,
  (list) => {
    const previous = selected.value;
    // Porównujemy też po `id`: lista może przyjść jako nowe obiekty o tych
    // samych identyfikatorach (odświeżenie, proksy w testach), a wtedy wybór
    // użytkownika ma zostać.
    const keep =
      !!previous &&
      list.some((entry) => entry === previous || (!!previous.id && entry.id === previous.id));
    if (!keep) selected.value = list[0] ?? null;
  },
  { immediate: true }
);

const typeIcon = {
  image: Image,
  video: Play,
  audio: Music2,
  file: File
} as const;

const current = computed(() => selected.value);
const isCurrent = (entry: SourceItem): boolean => {
  const currentItem = current.value;
  if (!currentItem) return false;
  return entry === currentItem || (!!currentItem.id && entry.id === currentItem.id);
};
const isDownloadingCurrent = computed(() => {
  const downloading = props.downloadingItem;
  const currentItem = current.value;
  if (!downloading || !currentItem) return false;
  return downloading === currentItem || (!!currentItem.id && downloading.id === currentItem.id);
});
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
          class="w-full h-full object-contain bg-canvas"
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
          class="text-sm text-primary-text hover:underline flex items-center gap-1"
        >
          {{ $t('sources.openInBrowser') }}
          <ExternalLink :size="14" />
        </a>
        <p v-else role="status" class="text-sm text-base-content/50">{{ $t('sources.noItems') }}</p>
      </div>

      <div
        v-if="current"
        class="shrink-0 flex items-center gap-3 px-4 py-3 border-t border-hairline bg-base-100"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium truncate">{{ current.title || $t('sources.untitled') }}</p>
          <p v-if="current.subtitle" class="text-xs text-base-content/50 truncate mt-0.5">
            {{ current.subtitle }}
          </p>
        </div>
        <button
          type="button"
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-base-200 border border-hairline text-xs text-base-content/80 hover:bg-base-content/10 transition-colors"
          :title="$t('sources.openInModal')"
          :aria-label="$t('sources.openInModal')"
          @click="emit('activate', current)"
        >
          <Maximize2 :size="13" />
          {{ $t('sources.openInModal') }}
        </button>
        <button
          v-if="downloadable && (current.mediaUrl || current.playerUrl)"
          type="button"
          class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors disabled:opacity-70"
          :class="
            isDownloaded
              ? 'bg-success text-success-content'
              : 'bg-primary text-primary-content hover:bg-primary/90'
          "
          :disabled="isDownloaded || isDownloadingCurrent"
          @click="emit('download', current)"
        >
          <Check v-if="isDownloaded" :size="13" />
          <Download v-else :size="13" />
          {{ isDownloaded ? $t('sources.downloaded') : $t('sources.download') }}
        </button>
      </div>
    </div>

    <!-- Lista (zwykły przepływ — równe, gęste odstępy) -->
    <aside class="w-72 max-lg:w-60 shrink-0 border-l border-hairline overflow-y-auto">
      <button
        v-for="(item, i) in items"
        :key="item.id || i"
        type="button"
        class="fx-noise w-full flex items-center gap-2 px-2.5 py-2 text-left border-b border-base-200 transition-colors"
        :class="
          selectable && item.id && selectedIds?.has(item.id)
            ? 'ring-1 ring-primary bg-primary/10'
            : isCurrent(item)
              ? 'bg-primary/15'
              : 'hover:bg-base-content/5'
        "
        :title="item.title"
        :aria-label="item.title"
        @click="selectable ? emit('select', item, $event) : (selected = item)"
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
        <span class="w-16 h-10 shrink-0 rounded-field overflow-hidden bg-neutral">
          <img
            v-if="item.thumbnail"
            :src="item.thumbnail"
            :alt="item.title"
            loading="lazy"
            class="w-full h-full object-cover"
          />
          <span v-else class="w-full h-full flex items-center justify-center text-base-content/50">
            <component :is="typeIcon[item.type]" :size="16" />
          </span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium line-clamp-1">{{
            item.title || $t('sources.untitled')
          }}</span>
          <span v-if="item.subtitle" class="block text-2xs text-base-content/50 truncate">{{
            item.subtitle
          }}</span>
        </span>
        <Check
          v-if="item.id && downloadedIds?.has(item.id)"
          :size="12"
          class="shrink-0 text-success"
        />
      </button>
    </aside>
  </div>
</template>
