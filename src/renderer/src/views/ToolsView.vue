<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ExternalLink,
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
    <PageHeader :title="t('tools.title')" :subtitle="t('tools.subtitle')" :icon="Wrench" />

    <div class="flex-1 overflow-auto p-4">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="card in cards"
          :key="card.id"
          :data-testid="`tools-card-${card.id}`"
          class="group flex min-h-44 flex-col rounded-box border border-base-300 bg-base-100/70 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60"
          :disabled="opening !== null"
          @click="openTool(card.id)"
        >
          <span
            class="mb-4 flex h-11 w-11 items-center justify-center rounded-field bg-primary/10 text-primary-text transition-colors group-hover:bg-primary/15"
          >
            <component :is="card.icon" :size="22" />
          </span>
          <span class="text-sm font-semibold text-base-content">{{ card.title }}</span>
          <span class="mt-1 text-xs leading-relaxed text-base-content/60">
            {{ card.description }}
          </span>
          <span
            class="mt-auto flex items-center gap-1.5 pt-4 text-xs font-medium text-primary-text"
          >
            {{ t('tools.openInNewWindow') }}
            <ExternalLink :size="13" />
          </span>
        </button>

        <div
          class="flex min-h-44 flex-col items-center justify-center rounded-box border border-dashed border-base-300 p-4 text-center text-base-content/45"
        >
          <Plus :size="26" class="mb-3 opacity-50" />
          <p class="text-sm font-medium text-base-content/65">{{ t('tools.moreComing') }}</p>
          <p class="mt-1 max-w-56 text-xs">{{ t('tools.moreComingDescription') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
