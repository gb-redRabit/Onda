<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { displayTrackNumber } from '@renderer/utils/musicbrainz';

type Track = { id?: string; title: string; number?: string; position?: string };

defineProps<{ tracks: Track[] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="tracks.length" class="space-y-1 max-h-32 overflow-y-auto">
    <div
      v-for="(mediumTrack, ti) in tracks.slice(0, 30)"
      :key="mediumTrack.id"
      class="flex items-center gap-2 text-xs text-base-content/70"
    >
      <span class="w-5 text-right shrink-0 text-base-content/50">{{
        displayTrackNumber(mediumTrack, ti)
      }}</span>
      <span class="truncate">{{ mediumTrack.title }}</span>
    </div>
    <div v-if="tracks.length > 30" class="text-xs text-base-content/50 text-center pt-1">
      + {{ tracks.length - 30 }} {{ t('musicbrainz.more') }}
    </div>
  </div>
</template>
