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
        <component :is="typeIcon[item.type]" :size="32" class="text-base-content/40" />
      </div>
    </div>

    <!-- Badge typu (lewy-górny) i czasu (prawy-górny) -->
    <span
      class="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-field bg-black/60 text-white text-[10px] font-medium uppercase"
    >
      <component :is="typeIcon[item.type]" :size="10" />
      {{ item.type }}
    </span>
    <span
      v-if="item.duration && !selectable"
      class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-field bg-black/60 text-white text-[10px] font-mono"
    >
      {{ item.duration }}
    </span>
    <span
      v-if="selectable"
      class="absolute top-1.5 right-1.5 w-5 h-5 rounded-field flex items-center justify-center border"
      :class="
        selected
          ? 'bg-primary border-primary text-primary-content'
          : 'bg-black/60 border-white/40 text-transparent'
      "
      aria-hidden="true"
    >
      <Check :size="12" />
    </span>

    <!-- Tytuł na gradiencie -->
    <div class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 to-transparent">
      <p class="text-xs font-medium text-white line-clamp-1">
        {{ item.title || $t('sources.untitled') }}
      </p>
      <p v-if="item.subtitle" class="text-[11px] text-white/70 line-clamp-1">{{ item.subtitle }}</p>
    </div>

    <!-- Hover: wskaźnik podglądu + pobieranie -->
    <div
      class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <span
        class="flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        <Play :size="16" />
      </span>
    </div>
    <span
      v-if="downloaded"
      class="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-field bg-success text-success-content text-[10px] font-medium"
      :title="$t('sources.downloaded')"
    >
      <Check :size="10" />
    </span>
    <button
      v-else-if="downloadable && (item.mediaUrl || item.playerUrl)"
      class="fx-noise absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-black/60 text-white text-[10px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-60"
      :title="$t('sources.download')"
      :aria-label="$t('sources.download')"
      :disabled="downloading"
      @click.stop="emit('download', item)"
    >
      <Download :size="11" />
    </button>
  </div>
</template>
