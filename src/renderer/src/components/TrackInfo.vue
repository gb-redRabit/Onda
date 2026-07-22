<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaFile } from '@renderer/types/media';

const { t } = useI18n();

const props = withDefaults(defineProps<{
  track: MediaFile | null;
  showArtist?: boolean;
  showAlbum?: boolean;
  titleSize?: string;
  artistSize?: string;
  titleClass?: string;
  artistClass?: string;
  showFallback?: boolean;
}>(), {
  showArtist: true,
  showAlbum: false,
  titleSize: 'text-sm',
  artistSize: 'text-xs',
  titleClass: '',
  artistClass: '',
  showFallback: true
});

const displayTitle = computed(() => props.track?.metadata?.title || props.track?.name || (props.showFallback ? t('playerBar.noTrack') : ''));
const displayArtist = computed(() => {
  if (!props.showArtist) return '';
  if (props.track?.metadata?.artist) return props.track.metadata.artist;
  if (props.track?.metadata?.album) return props.track.metadata.album;
  return props.showFallback ? t('common.unknown') : '';
});
const displayAlbum = computed(() => props.showAlbum && props.track?.metadata?.album ? props.track.metadata.album : '');
</script>

<template>
  <div class="min-w-0">
    <div :class="['font-medium truncate', titleSize, titleClass]">
      {{ displayTitle }}
    </div>
    <div v-if="displayArtist" :class="['text-fg-faint truncate', artistSize, artistClass]">
      {{ displayArtist }}<template v-if="displayAlbum"> · {{ displayAlbum }}</template>
    </div>
  </div>
</template>
