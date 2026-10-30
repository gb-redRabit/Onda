<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Switch from '@renderer/components/ui/Switch.vue';
import FilenameTemplateFields from './FilenameTemplateFields.vue';
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

  <!-- Szablon nazwy pliku -->
  <FilenameTemplateFields v-model:filename-template="filenameTemplate" />

  <!-- Dodaj do biblioteki -->
  <section>
    <div class="flex items-center gap-2 text-sm">
      <Switch
        v-model="addToLibrary"
        size="sm"
        :label="t('youtube.addToLibraryPref')"
        :title="t('youtube.addToLibraryPrefDesc')"
      />
      <span>{{ t('youtube.addToLibraryPref') }}</span>
    </div>
    <p class="mt-1 text-2xs text-base-content/50">
      {{ t('youtube.addToLibraryPrefDesc') }}
    </p>
  </section>
</template>
