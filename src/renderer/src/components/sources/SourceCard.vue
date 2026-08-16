<script setup lang="ts">
import { Image, Play, Music2, File, Download, Eye } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

defineProps<{
  item: SourceItem;
  downloading?: boolean;
  /** Poziom ma skonfigurowane pole pobierania — bez tego przycisk Pobierz się nie pojawia. */
  downloadable?: boolean;
}>();

const emit = defineEmits<{
  preview: [item: SourceItem];
  download: [item: SourceItem];
}>();

const typeIcon = {
  image: Image,
  video: Play,
  audio: Music2,
  file: File
} as const;
</script>

<template>
  <div class="group cursor-pointer" @click="emit('preview', item)">
    <div class="relative rounded-xl overflow-hidden bg-bg-elevated">
      <div class="aspect-video w-full">
        <img
          v-if="item.thumbnail || (item.type === 'image' && item.mediaUrl)"
          :src="item.thumbnail || (item.type === 'image' ? item.mediaUrl : '')"
          :alt="item.title"
          loading="lazy"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center bg-bg-overlay"
        >
          <component :is="typeIcon[item.type]" :size="32" class="text-fg-faint/50" />
        </div>
      </div>
      <div
        v-if="downloadable"
        class="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium uppercase"
      >
        <component :is="typeIcon[item.type]" :size="10" />
        <span>{{ item.type }}</span>
      </div>
      <div
        v-if="item.duration"
        class="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded"
      >
        {{ item.duration }}
      </div>
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
      >
        <div class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Eye :size="28" class="text-white drop-shadow" />
        </div>
      </div>
      <button
        v-if="downloadable && (item.mediaUrl || item.playerUrl)"
        class="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] hover:bg-black/90 disabled:opacity-60"
        :title="$t('sources.download')"
        :disabled="downloading || (!item.mediaUrl && !item.playerUrl)"
        @click.stop="emit('download', item)"
      >
        <Download :size="11" />
      </button>
    </div>
    <div class="mt-2">
      <h3 class="text-sm font-medium line-clamp-2">{{ item.title || $t('sources.untitled') }}</h3>
      <p v-if="item.subtitle" class="text-xs text-fg-faint mt-0.5 truncate">{{ item.subtitle }}</p>
    </div>
  </div>
</template>