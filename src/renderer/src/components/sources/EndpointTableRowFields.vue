<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DraftEndpoint } from '@renderer/components/sources/endpointDraft';
import FieldLabel from './FieldLabel.vue';

// Pola wiersza tabeli strony: tytuł, miniatura, URL playera, klucz wiersza.
const props = defineProps<{ rowOptions: string[]; idBase: string }>();
const model = defineModel<DraftEndpoint>({ required: true });
const { t } = useI18n();

function fieldId(suffix: string): string {
  return `dl-${props.idBase}-${suffix}`;
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <div>
      <FieldLabel :text="t('sources.tableRowTitle')" :upper="false" tight />
      <input
        v-model="model.tableTitle"
        type="text"
        :list="fieldId('ttitle')"
        :placeholder="$t('sources.episodeTemplatePlaceholder') + ' {n}'"
        :aria-label="t('sources.tableRowTitle')"
        class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
      />
      <datalist :id="fieldId('ttitle')">
        <option v-for="o in rowOptions" :key="o" :value="`{${o}}`" />
      </datalist>
    </div>
    <div>
      <FieldLabel :text="t('sources.tableRowThumb')" :upper="false" tight />
      <input
        v-model="model.tableThumbnail"
        type="text"
        :list="fieldId('tthumb')"
        placeholder="bg"
        :aria-label="t('sources.tableRowThumb')"
        class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
      />
      <datalist :id="fieldId('tthumb')">
        <option v-for="o in rowOptions" :key="o" :value="o" />
      </datalist>
    </div>
    <div>
      <FieldLabel :text="t('sources.tableRowPlayer')" :upper="false" tight />
      <input
        v-model="model.tablePlayerUrl"
        type="text"
        :list="fieldId('tplayer')"
        :placeholder="t('sources.tableRowPlayerPh')"
        :aria-label="t('sources.tableRowPlayer')"
        class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
      />
      <datalist :id="fieldId('tplayer')">
        <option v-for="o in rowOptions" :key="o" :value="o" />
      </datalist>
    </div>
    <div>
      <FieldLabel :text="t('sources.tableRowKey')" :upper="false" tight />
      <input
        v-model="model.tableRowKey"
        type="text"
        :list="fieldId('trowkey')"
        placeholder="anime_episode_number"
        :aria-label="t('sources.tableRowKey')"
        class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
      />
      <datalist :id="fieldId('trowkey')">
        <option v-for="o in rowOptions" :key="o" :value="o" />
      </datalist>
    </div>
  </div>
</template>
