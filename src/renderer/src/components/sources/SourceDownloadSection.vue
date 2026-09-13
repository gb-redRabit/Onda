<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ defaultDir: string }>();
const outputDir = defineModel<string>('outputDir', { required: true });
const folder = defineModel<boolean>('folder', { required: true });

const { t } = useI18n();

async function pickDownloadDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths[0]) outputDir.value = paths[0];
}
</script>

<template>
  <div class="space-y-2 rounded-box border border-neutral-content/20 bg-neutral p-3">
    <label class="block text-[11px] font-medium text-base-content/50 uppercase tracking-wider">
      {{ t('sources.downloadSection') }}
    </label>
    <div>
      <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-1">
        {{ t('sources.downloadOutputDir') }}
      </label>
      <div class="flex items-center gap-2">
        <input
          v-model="outputDir"
          type="text"
          :placeholder="defaultDir"
          class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          class="fx-noise shrink-0 px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
          @click="pickDownloadDir"
        >
          {{ t('sources.chooseFolder') }}
        </button>
      </div>
      <p class="text-[10px] text-base-content/50 mt-1">
        {{ t('sources.downloadDefaultHint', { path: defaultDir }) }}
      </p>
    </div>
    <label class="flex items-center gap-2 text-xs text-base-content/70 select-none">
      <input v-model="folder" type="checkbox" class="accent-primary" />
      {{ t('sources.downloadFolder') }}
    </label>
    <p class="text-[10px] text-base-content/50">
      {{ t('sources.downloadFolderHint') }}
    </p>
  </div>
</template>
