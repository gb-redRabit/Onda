<script setup lang="ts">
import FormatOptionsFields from './FormatOptionsFields.vue';
import { AUDIO_QUALITIES } from '@renderer/utils/downloadConfigMeta';

defineProps<{ isSc: boolean }>();
const kind = defineModel<'audio' | 'video'>('kind', { required: true });
const format = defineModel<string>('format', { required: true });
const audioQuality = defineModel<string>('audioQuality', { required: true });
const quality = defineModel<string>('quality', { required: true });
const videoContainer = defineModel<'mp4' | 'mkv' | 'webm'>('videoContainer', { required: true });
const audioLanguage = defineModel<string>('audioLanguage', { required: true });
const trimStart = defineModel<number | null>('trimStart', { required: true });
const trimEnd = defineModel<number | null>('trimEnd', { required: true });
const filenameTemplate = defineModel<string>('filenameTemplate', { required: true });
const sponsorBlock = defineModel<'off' | 'mark' | 'remove'>('sponsorBlock', { required: true });
</script>

<template>
  <FormatOptionsFields
    v-model:kind="kind"
    v-model:format="format"
    v-model:audio-quality="audioQuality"
    v-model:quality="quality"
    v-model:video-container="videoContainer"
    v-model:audio-language="audioLanguage"
    v-model:trim-start="trimStart"
    v-model:trim-end="trimEnd"
    v-model:filename-template="filenameTemplate"
    v-model:sponsor-block="sponsorBlock"
    :is-sc="isSc"
    :audio-qualities="AUDIO_QUALITIES"
    show-video-container
    show-filename-template
  />
</template>
