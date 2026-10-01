<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { X, Download, ExternalLink, Check } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

const props = defineProps<{
  item: SourceItem | null;
  /** Poziom ma skonfigurowane pole pobierania — bez tego przycisk Pobierz się nie pojawia. */
  downloadable?: boolean;
  /** Element o tym API id został już pobrany (potwierdzone przez main). */
  downloaded?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  download: [item: SourceItem];
}>();

function mediaUrl(item: SourceItem): string {
  return item.mediaUrl || item.sourceUrl || '';
}

function hasDownloadUrl(item: SourceItem): boolean {
  return !!(item.mediaUrl || item.playerUrl);
}

function browserUrl(item: SourceItem): string {
  return item.playerUrl || item.sourceUrl || item.mediaUrl || '';
}
</script>

<template>
  <ModalShell
    :visible="!!props.item"
    labelled-by="source-detail-modal-title"
    panel-class="w-full max-w-3xl max-h-full flex flex-col overflow-hidden"
    @close="emit('close')"
  >
    <template v-if="props.item">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
        <h2 id="source-detail-modal-title" class="text-sm font-medium truncate flex-1">
          {{ props.item.title || $t('sources.untitled') }}
        </h2>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :aria-label="$t('common.close')"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </div>

      <div class="flex-1 min-h-0 flex items-center justify-center bg-neutral/40 p-4 overflow-auto">
        <img
          v-if="props.item.type === 'image' && mediaUrl(props.item)"
          :src="mediaUrl(props.item)"
          :alt="props.item.title"
          class="max-w-full max-h-full object-contain rounded-field"
        />
        <video
          v-else-if="props.item.type === 'video' && mediaUrl(props.item)"
          :src="mediaUrl(props.item)"
          controls
          autoplay
          class="max-w-full max-h-full rounded-field bg-neutral"
        />
        <audio
          v-else-if="props.item.type === 'audio' && mediaUrl(props.item)"
          :src="mediaUrl(props.item)"
          controls
          autoplay
          class="w-full"
        />
        <div v-else-if="props.item.playerUrl" class="w-full">
          <iframe
            :src="props.item.playerUrl"
            class="w-full aspect-video rounded-field bg-neutral border-0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-downloads"
          />
        </div>
        <a
          v-else
          :href="browserUrl(props.item)"
          target="_blank"
          rel="noreferrer"
          class="text-sm text-primary hover:underline flex items-center gap-1"
        >
          {{ $t('sources.openInBrowser') }}
          <ExternalLink :size="14" />
        </a>
      </div>

      <div class="flex items-center gap-2 px-4 py-3 border-t border-base-300">
        <span v-if="props.item.subtitle" class="text-xs text-base-content/50 flex-1 truncate">
          {{ props.item.subtitle }}
        </span>
        <a
          v-else-if="browserUrl(props.item)"
          :href="browserUrl(props.item)"
          target="_blank"
          rel="noreferrer"
          class="text-xs text-base-content/70 hover:text-base-content hover:underline flex items-center gap-1"
        >
          {{ $t('sources.openInBrowser') }}
          <ExternalLink :size="12" />
        </a>
        <span v-else class="flex-1" />
        <button
          v-if="props.downloadable"
          class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-70"
          :class="
            props.downloaded
              ? 'bg-success text-success-content'
              : 'bg-primary text-primary-content hover:bg-primary/90'
          "
          :disabled="props.downloaded || !hasDownloadUrl(props.item)"
          @click="emit('download', props.item)"
        >
          <Check v-if="props.downloaded" :size="12" />
          <Download v-else :size="12" />
          {{ props.downloaded ? $t('sources.downloaded') : $t('sources.download') }}
        </button>
      </div>
    </template>
  </ModalShell>
</template>
