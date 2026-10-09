<script setup lang="ts">
import { Image, Play, Music2, File, Download, Eye, Check } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

defineProps<{
  item: SourceItem;
  downloading?: boolean;
  /** Poziom ma skonfigurowane pole pobierania — bez tego przycisk Pobierz się nie pojawia. */
  downloadable?: boolean;
  /** Element o tym API id został już pobrany (potwierdzone przez main). */
  downloaded?: boolean;
  /** Tryb zaznaczania zbiorczego — klik w kartę zaznacza zamiast otwierać podgląd. */
  selectable?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{
  preview: [item: SourceItem];
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
    class="group cursor-pointer"
    :class="selected ? 'rounded-box ring-2 ring-primary' : ''"
    @click="selectable ? emit('select', item, $event) : emit('preview', item)"
  >
    <div class="relative rounded-box overflow-hidden bg-base-100 border border-base-300">
      <div class="aspect-video w-full">
        <img
          v-if="item.thumbnail || (item.type === 'image' && item.mediaUrl)"
          :src="item.thumbnail || (item.type === 'image' ? item.mediaUrl : '')"
          :alt="item.title"
          loading="lazy"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-full h-full flex items-center justify-center bg-neutral">
          <component :is="typeIcon[item.type]" :size="32" class="text-base-content/50" />
        </div>
      </div>
      <div
        class="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-field bg-neutral/70 text-neutral-content text-[10px] font-medium uppercase"
      >
        <component :is="typeIcon[item.type]" :size="10" />
        <span>{{ item.type }}</span>
      </div>
      <div
        v-if="item.duration"
        class="absolute bottom-1.5 right-1.5 bg-neutral/80 text-neutral-content text-[10px] px-1.5 py-0.5 rounded-field"
      >
        {{ item.duration }}
      </div>
      <div
        v-if="selectable"
        class="absolute top-1.5 right-1.5 w-5 h-5 rounded-field flex items-center justify-center border"
        :class="
          selected
            ? 'bg-primary border-primary text-primary-content'
            : 'bg-neutral/60 border-neutral-content/40 text-transparent'
        "
        aria-hidden="true"
      >
        <Check :size="12" />
      </div>
      <div
        v-if="downloaded && !selectable"
        class="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-field bg-success text-success-content text-[10px] font-medium"
        :title="$t('sources.downloaded')"
      >
        <Check :size="10" />
        <span>{{ $t('sources.downloaded') }}</span>
      </div>
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/30 transition-colors"
      >
        <div class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye :size="28" class="text-neutral-content drop-shadow" />
        </div>
      </div>
      <button
        v-if="downloadable && (item.mediaUrl || item.playerUrl)"
        class="fx-noise absolute bottom-1.5 left-1.5 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 fx-depth rounded-field text-neutral-content text-[10px] disabled:opacity-60"
        :class="
          downloaded ? 'bg-success/80 hover:bg-success/80' : 'bg-neutral/70 hover:bg-neutral/90'
        "
        :title="downloaded ? $t('sources.downloaded') : $t('sources.download')"
        :aria-label="downloaded ? $t('sources.downloaded') : $t('sources.download')"
        :disabled="downloaded || downloading || (!item.mediaUrl && !item.playerUrl)"
        @click.stop="emit('download', item)"
      >
        <Check v-if="downloaded" :size="11" />
        <Download v-else :size="11" />
      </button>
    </div>
    <div class="mt-2">
      <h3 class="text-sm font-medium line-clamp-2">{{ item.title || $t('sources.untitled') }}</h3>
      <p v-if="item.subtitle" class="text-xs text-base-content/50 mt-0.5 truncate">
        {{ item.subtitle }}
      </p>
    </div>
  </div>
</template>
