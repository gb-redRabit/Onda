<script setup lang="ts">
import { X, Download, ExternalLink } from '@lucide/vue';
import type { SourceItem } from '@renderer/types/sources';

const props = defineProps<{
  item: SourceItem | null;
}>();

const emit = defineEmits<{
  close: [];
  download: [item: SourceItem];
}>();

function mediaUrl(item: SourceItem): string {
  return item.mediaUrl || item.sourceUrl || '';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.item"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-3xl max-h-full flex flex-col rounded-2xl bg-bg-surface border border-border-default shadow-2xl overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <h2 class="text-sm font-medium truncate flex-1">
            {{ props.item.title || $t('sources.untitled') }}
          </h2>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex-1 min-h-0 flex items-center justify-center bg-black/40 p-4 overflow-auto">
          <img
            v-if="props.item.type === 'image' && mediaUrl(props.item)"
            :src="mediaUrl(props.item)"
            :alt="props.item.title"
            class="max-w-full max-h-full object-contain rounded-lg"
          />
          <video
            v-else-if="props.item.type === 'video' && mediaUrl(props.item)"
            :src="mediaUrl(props.item)"
            controls
            autoplay
            class="max-w-full max-h-full rounded-lg bg-black"
          />
          <audio
            v-else-if="props.item.type === 'audio' && mediaUrl(props.item)"
            :src="mediaUrl(props.item)"
            controls
            autoplay
            class="w-full"
          />
          <a
            v-else
            :href="mediaUrl(props.item) || props.item.sourceUrl"
            target="_blank"
            rel="noreferrer"
            class="text-sm text-accent-base hover:underline flex items-center gap-1"
          >
            {{ $t('sources.openInBrowser') }}
            <ExternalLink :size="14" />
          </a>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-t border-border-default">
          <span v-if="props.item.subtitle" class="text-xs text-fg-faint flex-1 truncate">
            {{ props.item.subtitle }}
          </span>
          <span v-else class="flex-1" />
          <button
            class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-strong transition-colors flex items-center gap-1.5"
            :disabled="!mediaUrl(props.item)"
            @click="emit('download', props.item)"
          >
            <Download :size="12" />
            {{ $t('sources.download') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>