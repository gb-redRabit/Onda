<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';
import OutputFolderSection from './OutputFolderSection.vue';

defineProps<{ channelFolder: string }>();
const folderMode = defineModel<'channel' | 'global' | 'playlist' | 'custom'>('folderMode', {
  required: true
});
const outputDir = defineModel<string>('outputDir', { required: true });
const filenameTemplate = defineModel<string>('filenameTemplate', { required: true });
const addToLibrary = defineModel<boolean>('addToLibrary', { required: true });

const { t } = useI18n();
</script>

<template>
  <OutputFolderSection
    v-model:folder-mode="folderMode"
    v-model:output-dir="outputDir"
    :channel-title="t('youtube.prefOutputDirChannel')"
    :channel-folder="channelFolder"
  />

  <!-- Filename template -->
  <section>
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-1">
      {{ t('youtube.prefTemplate') }}
    </p>
    <input
      v-model="filenameTemplate"
      class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none"
      :placeholder="t('youtube.prefTemplatePlaceholder')"
    />
    <div class="mt-1.5">
      <FilenameTemplatePresets @preset="(p) => (filenameTemplate = p)" />
    </div>
  </section>

  <!-- Add to library -->
  <section>
    <label
      class="flex items-center gap-2 text-sm cursor-pointer select-none"
      :title="t('youtube.addToLibraryPrefDesc')"
    >
      <input v-model="addToLibrary" type="checkbox" />
      <span>{{ t('youtube.addToLibraryPref') }}</span>
    </label>
    <p class="mt-1 text-[11px] text-base-content/50">
      {{ t('youtube.addToLibraryPrefDesc') }}
    </p>
  </section>
</template>
