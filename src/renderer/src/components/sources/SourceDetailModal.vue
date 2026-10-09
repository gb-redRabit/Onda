<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { X, Download, ExternalLink, Check, Undo2, MonitorPlay, Play, ListPlus } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';
import { openPreviewWindow } from '@renderer/utils/previewWindow';
import { isSourceItemPlayable } from '@renderer/utils/sourceStream';
import EmbedWebview from './EmbedWebview.vue';

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
  unmark: [item: SourceItem];
  play: [item: SourceItem];
  queue: [item: SourceItem];
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
    data-testid="source-detail-modal"
    panel-class="w-full max-w-5xl max-h-full flex flex-col overflow-hidden"
    @close="emit('close')"
  >
    <template v-if="props.item">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
        <span
          class="shrink-0 px-2 py-0.5 rounded-field bg-base-200 text-[10px] font-medium uppercase text-base-content/60"
        >
          {{ props.item.type }}
        </span>
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

      <div class="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <!-- Media: player wypełnia całą kolumnę; obrazy/wideo wypełniają ją (object-contain). -->
        <div
          class="min-h-[45vh] md:min-h-0 md:h-full bg-neutral/40 overflow-hidden"
          :class="props.item.playerUrl ? '' : 'flex items-center justify-center p-4'"
        >
          <img
            v-if="props.item.type === 'image' && mediaUrl(props.item)"
            :src="mediaUrl(props.item)"
            :alt="props.item.title"
            class="w-full h-full object-contain"
          />
          <video
            v-else-if="props.item.type === 'video' && mediaUrl(props.item)"
            :src="mediaUrl(props.item)"
            controls
            autoplay
            class="w-full h-full object-contain bg-black"
          />
          <audio
            v-else-if="props.item.type === 'audio' && mediaUrl(props.item)"
            :src="mediaUrl(props.item)"
            controls
            autoplay
            class="w-full"
          />
          <EmbedWebview
            v-else-if="props.item.playerUrl"
            :src="props.item.playerUrl"
            :title="props.item.title"
            class="w-full h-full"
          />
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

        <!-- Metadane i akcje -->
        <div
          class="flex flex-col gap-4 p-4 md:border-l border-t md:border-t-0 border-base-300 overflow-y-auto bg-base-100"
        >
          <div>
            <p class="text-[11px] uppercase tracking-wider text-base-content/40 mb-1">
              {{ $t('sources.titleField') }}
            </p>
            <p class="text-sm font-medium leading-snug">
              {{ props.item.title || $t('sources.untitled') }}
            </p>
          </div>
          <div v-if="props.item.subtitle">
            <p class="text-[11px] uppercase tracking-wider text-base-content/40 mb-1">
              {{ $t('sources.subtitleField') }}
            </p>
            <p class="text-xs text-base-content/70">{{ props.item.subtitle }}</p>
          </div>
          <div v-if="props.item.duration">
            <p class="text-[11px] uppercase tracking-wider text-base-content/40 mb-1">
              {{ $t('sources.durationField') }}
            </p>
            <p class="text-xs font-mono text-base-content/70">{{ props.item.duration }}</p>
          </div>
          <div v-if="browserUrl(props.item)" class="min-w-0">
            <p class="text-[11px] uppercase tracking-wider text-base-content/40 mb-1">
              {{ $t('sources.sourceUrlField') }}
            </p>
            <a
              :href="browserUrl(props.item)"
              target="_blank"
              rel="noreferrer"
              class="text-xs text-primary hover:underline break-all"
            >
              {{ browserUrl(props.item) }}
            </a>
          </div>

          <div class="flex-1" />

          <div class="flex flex-col gap-2">
            <button
              v-if="isSourceItemPlayable(props.item)"
              class="fx-noise px-3 py-2 fx-depth rounded-field text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              data-testid="source-play-now"
              :title="$t('sources.playNow')"
              @click="emit('play', props.item)"
            >
              <Play :size="13" />
              {{ $t('sources.playNow') }}
            </button>
            <button
              v-if="isSourceItemPlayable(props.item)"
              class="fx-noise px-3 py-2 fx-depth rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors flex items-center justify-center gap-1.5"
              :title="$t('sources.addToQueue')"
              @click="emit('queue', props.item)"
            >
              <ListPlus :size="13" />
              {{ $t('sources.addToQueue') }}
            </button>
            <button
              v-if="props.item.playerUrl"
              class="fx-noise px-3 py-2 fx-depth rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors flex items-center justify-center gap-1.5"
              :title="$t('sources.openInPreview')"
              @click="openPreviewWindow(props.item.playerUrl, props.item.title)"
            >
              <MonitorPlay :size="13" />
              {{ $t('sources.openInPreview') }}
            </button>
            <button
              v-if="props.downloadable"
              class="fx-noise px-3 py-2 fx-depth rounded-field text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70"
              :class="
                props.downloaded
                  ? 'bg-success text-success-content'
                  : 'bg-primary text-primary-content hover:bg-primary/90'
              "
              :disabled="props.downloaded || !hasDownloadUrl(props.item)"
              @click="emit('download', props.item)"
            >
              <Check v-if="props.downloaded" :size="13" />
              <Download v-else :size="13" />
              {{ props.downloaded ? $t('sources.downloaded') : $t('sources.download') }}
            </button>
            <button
              v-if="props.downloaded"
              class="fx-noise px-3 py-2 fx-depth rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors flex items-center justify-center gap-1.5"
              :title="$t('sources.unmarkDownloaded')"
              @click="emit('unmark', props.item)"
            >
              <Undo2 :size="13" />
              {{ $t('sources.unmarkDownloaded') }}
            </button>
            <a
              v-if="browserUrl(props.item)"
              :href="browserUrl(props.item)"
              target="_blank"
              rel="noreferrer"
              class="fx-noise px-3 py-2 fx-depth rounded-field text-xs text-base-content/70 hover:bg-base-content/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <ExternalLink :size="13" />
              {{ $t('sources.openInBrowser') }}
            </a>
          </div>
        </div>
      </div>
    </template>
  </ModalShell>
</template>
