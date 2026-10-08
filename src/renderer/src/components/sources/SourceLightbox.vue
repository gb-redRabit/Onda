<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  MonitorPlay,
  ExternalLink
} from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';
import { useDialogFocus } from '@renderer/composables/useDialogFocus';
import { openPreviewWindow } from '@renderer/utils/previewWindow';
import EmbedWebview from './EmbedWebview.vue';

// Pełnoekranowy podgląd galerii: obraz/wideo/audio/embed wybranej pozycji,
// nawigacja ‹ ›, licznik, pasek miniatur i akcje (pobierz / odtwórz / okno podglądu).
const props = defineProps<{
  items: SourceItem[];
  index: number;
  downloadable?: boolean;
  downloadedIds?: Set<string>;
  downloadingItem?: SourceItem | null;
}>();

const emit = defineEmits<{
  'update:index': [value: number];
  close: [];
  download: [item: SourceItem];
  play: [item: SourceItem];
}>();

const panelRef = ref<HTMLElement | null>(null);
useDialogFocus(panelRef, { closeOnEscape: true, onEscape: () => emit('close') });

const current = computed<SourceItem | null>(() => props.items[props.index] ?? null);
const mediaUrl = computed(() => current.value?.mediaUrl || current.value?.sourceUrl || '');
const browserUrl = computed(
  () => current.value?.playerUrl || current.value?.sourceUrl || current.value?.mediaUrl || ''
);
const isDownloaded = computed(
  () => !!current.value?.id && (props.downloadedIds?.has(current.value.id) ?? false)
);

function go(delta: number): void {
  const n = props.items.length;
  if (n === 0) return;
  emit('update:index', (props.index + delta + n) % n);
}

function select(i: number): void {
  emit('update:index', i);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') go(-1);
  else if (event.key === 'ArrowRight') go(1);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-10000 flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Gallery"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <div ref="panelRef" class="flex flex-col h-full w-full outline-none">
        <!-- Pasek narzędzi -->
        <div class="shrink-0 flex items-center gap-2 px-3 py-2 text-white/80">
          <span class="text-xs font-mono tabular-nums shrink-0">
            {{ index + 1 }} / {{ items.length }}
          </span>
          <span class="flex-1 min-w-0 truncate text-sm text-white">
            {{ current?.title || $t('sources.untitled') }}
          </span>
          <button
            v-if="current?.playerUrl"
            class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 rounded-field hover:bg-white/10 transition-colors text-xs"
            :title="$t('sources.openInPreview')"
            @click="openPreviewWindow(current.playerUrl, current.title)"
          >
            <MonitorPlay :size="14" />
          </button>
          <button
            v-if="current?.mediaUrl"
            class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 rounded-field hover:bg-white/10 transition-colors text-xs"
            :title="$t('sources.playNow')"
            @click="current && emit('play', current)"
          >
            <Play :size="14" />
          </button>
          <button
            v-if="downloadable && (current?.mediaUrl || current?.playerUrl)"
            class="fx-noise shrink-0 flex items-center gap-1 px-2 py-1 rounded-field transition-colors text-xs disabled:opacity-50"
            :class="isDownloaded ? 'text-success' : 'hover:bg-white/10'"
            :disabled="isDownloaded || downloadingItem === current"
            :title="isDownloaded ? $t('sources.downloaded') : $t('sources.download')"
            @click="current && emit('download', current)"
          >
            <Download :size="14" />
          </button>
          <button
            class="fx-noise shrink-0 p-1.5 rounded-field hover:bg-white/10 transition-colors"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Scena -->
        <div class="flex-1 min-h-0 relative flex items-center justify-center px-12">
          <button
            class="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            :aria-label="$t('common.previous')"
            @click="go(-1)"
          >
            <ChevronLeft :size="22" />
          </button>
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            :aria-label="$t('common.next')"
            @click="go(1)"
          >
            <ChevronRight :size="22" />
          </button>

          <img
            v-if="current?.type === 'image' && mediaUrl"
            :key="current.id"
            :src="mediaUrl"
            :alt="current.title"
            class="max-h-full max-w-full object-contain"
          />
          <video
            v-else-if="current?.type === 'video' && mediaUrl"
            :key="current.id"
            :src="mediaUrl"
            controls
            autoplay
            class="max-h-full max-w-full bg-black"
          />
          <audio
            v-else-if="current?.type === 'audio' && mediaUrl"
            :key="current.id"
            :src="mediaUrl"
            controls
            autoplay
            class="w-full max-w-xl"
          />
          <EmbedWebview
            v-else-if="current?.playerUrl"
            :key="current.id"
            :src="current.playerUrl"
            :title="current.title"
            class="w-full h-full"
          />
          <a
            v-else-if="current"
            :href="browserUrl"
            target="_blank"
            rel="noreferrer"
            class="text-sm text-primary hover:underline flex items-center gap-1"
          >
            {{ $t('sources.openInBrowser') }}
            <ExternalLink :size="14" />
          </a>
        </div>

        <!-- Pasek miniatur -->
        <div class="shrink-0 flex gap-2 px-3 py-2 overflow-x-auto bg-black/40">
          <button
            v-for="(item, i) in items"
            :key="item.id || i"
            class="shrink-0 w-16 h-10 rounded-field overflow-hidden border-2 transition-colors"
            :class="i === index ? 'border-primary' : 'border-transparent hover:border-white/40'"
            :title="item.title"
            @click="select(i)"
          >
            <img
              v-if="item.thumbnail"
              :src="item.thumbnail"
              :alt="item.title"
              loading="lazy"
              class="w-full h-full object-cover"
            />
            <span
              v-else
              class="w-full h-full flex items-center justify-center bg-white/10 text-white/60 text-[10px]"
            >
              {{ i + 1 }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
