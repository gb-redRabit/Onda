<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { FolderOpen } from '@lucide/vue';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';

defineProps<{ channelFolder: string }>();
const folderMode = defineModel<'channel' | 'global' | 'custom'>('folderMode', { required: true });
const outputDir = defineModel<string>('outputDir', { required: true });
const filenameTemplate = defineModel<string>('filenameTemplate', { required: true });
const addToLibrary = defineModel<boolean>('addToLibrary', { required: true });

async function pickOutputDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

const { t } = useI18n();
</script>

<template>
  <!-- Output folder -->
  <section>
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.prefOutputDir') }}
    </p>
    <div class="flex items-center gap-2">
      <select
        v-model="folderMode"
        class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      >
        <option value="channel">{{ t('youtube.prefOutputDirChannel') }}</option>
        <option value="global">{{ t('youtube.prefOutputDirGlobal') }}</option>
        <option value="custom">{{ t('youtube.prefOutputDirCustom') }}</option>
      </select>
      <button
        v-if="folderMode === 'custom'"
        class="fx-noise flex items-center gap-1 px-3 py-2 fx-depth rounded-field border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors shrink-0"
        @click="pickOutputDir"
      >
        <FolderOpen :size="14" />
      </button>
    </div>
    <p
      v-if="folderMode === 'channel'"
      class="mt-1 truncate text-[11px] text-base-content/50"
      :title="channelFolder"
    >
      {{ t('youtube.prefOutputDirChannelHint', { folder: channelFolder }) }}
    </p>
    <input
      v-else-if="folderMode === 'custom'"
      v-model="outputDir"
      readonly
      class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      :placeholder="t('youtube.prefOutputDirPlaceholder')"
    />
  </section>

  <!-- Filename template -->
  <section>
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-1">
      {{ t('youtube.prefTemplate') }}
    </p>
    <input
      v-model="filenameTemplate"
      class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
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
