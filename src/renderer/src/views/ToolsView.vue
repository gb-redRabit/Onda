<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ExternalLink,
  History,
  Image as ImageIcon,
  Layers,
  Plus,
  Scissors,
  Tags,
  Wrench
} from '@lucide/vue';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import { useUIStore } from '@renderer/stores/ui';
import type { ToolId } from '@shared/types/tools';

const { t } = useI18n();
const ui = useUIStore();
const opening = ref<ToolId | null>(null);

const cards = computed(() => [
  {
    id: 'converter' as ToolId,
    icon: Wrench,
    title: t('tools.converterTitle'),
    description: t('tools.converterDescription')
  },
  {
    id: 'video-clipper' as ToolId,
    icon: Scissors,
    title: t('tools.videoClipperTitle'),
    description: t('tools.videoClipperDescription')
  },
  {
    id: 'video-concat' as ToolId,
    icon: Layers,
    title: t('tools.videoConcatTitle'),
    description: t('tools.videoConcatDescription')
  },
  {
    id: 'tag-editor' as ToolId,
    icon: Tags,
    title: t('tools.tagEditorTitle'),
    description: t('tools.tagEditorDescription')
  },
  {
    id: 'image-studio' as ToolId,
    icon: ImageIcon,
    title: t('tools.imageStudioTitle'),
    description: t('tools.imageStudioDescription')
  },
  {
    id: 'batch-images' as ToolId,
    icon: ImageIcon,
    title: t('tools.batchImagesTitle'),
    description: t('tools.batchImagesDescription')
  },
  {
    id: 'history-export' as ToolId,
    icon: History,
    title: t('tools.historyExportTitle'),
    description: t('tools.historyExportDescription')
  }
]);

async function openTool(id: ToolId): Promise<void> {
  if (opening.value) return;
  opening.value = id;
  try {
    const windowId = await window.api.invoke('tools:openWindow', id);
    if (windowId === null) {
      ui.notify('error', t('app.error'), t('tools.openFailed'));
    }
  } catch (error) {
    ui.notify('error', t('app.error'), error instanceof Error ? error.message : String(error));
  } finally {
    opening.value = null;
  }
}
</script>

<template>
  <div data-testid="tools-hub" class="flex h-full flex-col">
    <PageHeader :title="t('tools.title')" :subtitle="t('tools.subtitle')" :icon="Wrench" sticky />

    <div class="flex-1 overflow-auto p-6">
      <div class="mx-auto max-w-6xl space-y-6">
        <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="card in cards"
            :key="card.id"
            :data-testid="`tools-card-${card.id}`"
            class="group flex items-start gap-3.5 rounded-box border border-base-300/80 bg-base-100 p-4 text-left transition-all hover:border-primary/40 hover:bg-base-content/4 fx-depth disabled:cursor-wait disabled:opacity-60"
            :disabled="opening !== null"
            @click="openTool(card.id)"
          >
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-field bg-primary/10 text-primary-text transition-colors group-hover:bg-primary/16"
            >
              <component :is="card.icon" :size="19" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-semibold text-base-content">{{
                  card.title
                }}</span>
                <ExternalLink
                  :size="13"
                  class="shrink-0 text-base-content/35 transition-colors group-hover:text-primary-text"
                  :title="t('tools.openInNewWindow')"
                />
              </div>
              <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/60">
                {{ card.description }}
              </p>
              <span
                class="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary-text/80 group-hover:text-primary-text"
              >
                {{ t('tools.openInNewWindow') }}
              </span>
            </div>
          </button>
        </div>

        <div
          class="flex items-center gap-2.5 rounded-box border border-dashed border-base-300/70 bg-base-100/40 px-4 py-3 text-xs text-base-content/50"
        >
          <Plus :size="15" class="shrink-0 text-base-content/40" />
          <span class="font-medium text-base-content/65">{{ t('tools.moreComing') }}</span>
          <span class="text-base-content/35">·</span>
          <span>{{ t('tools.moreComingDescription') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
