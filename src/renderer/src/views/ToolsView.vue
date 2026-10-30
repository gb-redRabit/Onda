<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { History, Image as ImageIcon, Layers, Scissors, Tags, Wrench } from '@lucide/vue';
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
      <!-- Jedna oś z nagłówkiem: bez wyśrodkowanego kontenera. Siatka dobiera
           kolumny do szerokości, więc nie ma skoku przy 2/3 kolumnach. -->
      <div class="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
        <button
          v-for="card in cards"
          :key="card.id"
          :data-testid="`tools-card-${card.id}`"
          class="group flex items-start gap-3.5 rounded-box border border-base-300/80 bg-base-100 p-4 text-left fx-depth transition-all hover:border-primary/40 hover:bg-base-content/4 disabled:cursor-wait disabled:opacity-60"
          :disabled="opening !== null"
          @click="openTool(card.id)"
        >
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-field bg-primary/10 text-primary-text transition-colors group-hover:bg-primary/16"
          >
            <component :is="card.icon" :size="19" />
          </span>
          <div class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-base-content">{{
              card.title
            }}</span>
            <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/60">
              {{ card.description }}
            </p>
            <span
              class="mt-2.5 inline-flex items-center gap-1 text-2xs font-medium text-primary-text/80 group-hover:text-primary-text"
            >
              {{ t('tools.openInNewWindow') }}
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
