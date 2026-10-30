<script setup lang="ts">
import { Image, Play, Music2, File, Download, Check } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

// Kafelek galerii: obraz na pełnym tle (bez ramki karty), tytuł na gradiencie,
// badge typu/czasu oraz akcja pobierania na hover. Klik = podgląd (lightbox).
defineProps<{
  item: SourceItem;
  downloadable?: boolean;
  downloaded?: boolean;
  downloading?: boolean;
  /** Tryb zaznaczania zbiorczego — klik zaznacza zamiast otwierać podgląd. */
  selectable?: boolean;
  selected?: boolean;
  /** Pokazuj typ elementu tylko przy mieszanej liście. */
  showType?: boolean;
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
  <div
    v-activate
    class="group relative rounded-box overflow-hidden bg-neutral cursor-pointer"
    data-testid="source-gallery-tile"
    :class="selected ? 'ring-2 ring-primary' : ''"
    :title="item.title"
    @click="selectable ? emit('select', item, $event) : emit('activate', item)"
  >
    <div class="aspect-video w-full">
      <img
        v-if="item.thumbnail || (item.type === 'image' && item.mediaUrl)"
        :src="item.thumbnail || (item.type === 'image' ? item.mediaUrl : '')"
        :alt="item.title"
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-neutral">
        <component :is="typeIcon[item.type]" :size="32" class="text-base-content/55" />
      </div>
    </div>

    <!-- Badge typu (lewy-górny) i czasu (prawy-górny) -->
    <span
      v-if="showType !== false"
      class="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-field bg-neutral/80 px-1.5 py-0.5 text-2xs font-medium uppercase text-neutral-content ring-1 ring-inset ring-neutral-content/10"
    >
      <component :is="typeIcon[item.type]" :size="10" />
      {{ item.type }}
    </span>
    <span
      v-if="item.duration && !selectable"
      class="absolute top-1.5 right-1.5 rounded-field bg-neutral/80 px-1.5 py-0.5 font-mono text-2xs text-neutral-content ring-1 ring-inset ring-neutral-content/10"
    >
      {{ item.duration }}
    </span>
    <span
      v-if="selectable"
      class="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-field border"
      :class="
        selected
          ? 'border-primary bg-primary text-primary-content'
          : 'border-neutral-content/40 bg-neutral/70 text-transparent'
      "
      aria-hidden="true"
    >
      <Check :size="12" />
    </span>

    <!-- Tytuł na gradiencie -->
    <div class="scrim absolute inset-x-0 bottom-0 p-2">
      <p class="line-clamp-1 text-xs font-medium text-neutral-content">
        {{ item.title || $t('sources.untitled') }}
      </p>
      <p v-if="item.subtitle" class="line-clamp-1 text-2xs text-neutral-content/70">
        {{ item.subtitle }}
      </p>
    </div>

    <!-- Hover: wskaźnik podglądu + pobieranie -->
    <div
      class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <span
        class="flex h-9 w-9 items-center justify-center rounded-full bg-neutral/70 text-neutral-content backdrop-blur-sm"
      >
        <Play :size="16" />
      </span>
    </div>
    <span
      v-if="downloaded"
      class="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-field bg-success px-1.5 py-0.5 text-2xs font-medium text-success-content"
      :title="$t('sources.downloaded')"
    >
      <Check :size="10" />
    </span>
    <button
      v-else-if="downloadable && (item.mediaUrl || item.playerUrl)"
      class="fx-noise absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-field bg-neutral/80 px-2 py-1 text-2xs text-neutral-content opacity-0 fx-depth ring-1 ring-inset ring-neutral-content/10 transition-opacity hover:bg-neutral group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
      :title="$t('sources.download')"
      :aria-label="$t('sources.download')"
      :disabled="downloading"
      @click.stop="emit('download', item)"
    >
      <Download :size="11" />
    </button>
  </div>
</template>
