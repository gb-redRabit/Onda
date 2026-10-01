<script setup lang="ts">
import OutputFolderSection from './OutputFolderSection.vue';

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
</script>

<template>
  <OutputFolderSection
    v-if="channelTitle || playlistTitle"
    v-model:folder-mode="folderMode"
    v-model:output-dir="outputDir"
    :channel-title="channelTitle"
    :playlist-title="playlistTitle"
    :channel-folder="channelFolder"
    :playlist-folder="playlistFolder"
  />
</template>
