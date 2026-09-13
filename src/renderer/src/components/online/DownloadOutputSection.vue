<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { FolderOpen } from '@lucide/vue';

defineProps<{
  channelTitle?: string;
  playlistTitle?: string;
  channelFolder: string;
  playlistFolder: string;
}>();
const folderMode = defineModel<'global' | 'channel' | 'playlist' | 'custom'>('folderMode', {
  required: true
});
const outputDir = defineModel<string>('outputDir', { required: true });

async function pickOutputDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

const { t } = useI18n();
</script>

<template>
  <section v-if="channelTitle || playlistTitle">
    <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
      {{ t('youtube.prefOutputDir') }}
    </p>
    <div class="flex items-center gap-2">
      <select
        v-model="folderMode"
        class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      >
        <option value="global">{{ t('youtube.prefOutputDirGlobal') }}</option>
        <option v-if="channelTitle" value="channel">
          {{ t('youtube.prefOutputDirChannel') }}
        </option>
        <option v-if="playlistTitle" value="playlist">
          {{ t('youtube.folderModePlaylist') }}
        </option>
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
    <p
      v-else-if="folderMode === 'playlist'"
      class="mt-1 truncate text-[11px] text-base-content/50"
      :title="playlistFolder"
    >
      {{ t('youtube.folderModePlaylistHint', { folder: playlistFolder }) }}
    </p>
    <input
      v-else-if="folderMode === 'custom'"
      v-model="outputDir"
      readonly
      class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
      :placeholder="t('youtube.prefOutputDirPlaceholder')"
    />
  </section>
</template>
