<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { type DraftEndpoint } from './endpointDraft';
import FieldLabel from './FieldLabel.vue';

const { t } = useI18n();
const model = defineModel<DraftEndpoint>({ required: true });
</script>

<template>
  <details class="rounded-box border border-base-300 bg-base-100">
    <summary
      class="px-2.5 py-1.5 text-[11px] text-base-content/50 uppercase tracking-wider cursor-pointer select-none"
    >
      {{ t('sources.advanced') }}
    </summary>
    <div class="p-2.5 grid grid-cols-2 gap-2">
      <div>
        <FieldLabel :text="t('sources.method')" tight />
        <select
          v-model="model.method"
          :aria-label="t('sources.method')"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
      </div>
      <div>
        <FieldLabel :text="t('sources.params')" tight />
        <input
          v-model="model.paramsText"
          :aria-label="t('sources.params')"
          type="text"
          placeholder="rating=safe"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.arrayPath')" tight />
        <input
          v-model="model.arrayPath"
          :aria-label="t('sources.arrayPath')"
          type="text"
          placeholder="data"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.pageParam')" tight />
        <input
          v-model="model.pageParam"
          :aria-label="t('sources.pageParam')"
          type="text"
          placeholder="page"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.startPage')" tight />
        <input
          v-model.number="model.pageStart"
          :aria-label="t('sources.startPage')"
          type="number"
          min="1"
          placeholder="1"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.nextFromField')" tight />
        <input
          v-model="model.nextFromField"
          :aria-label="t('sources.nextFromField')"
          type="text"
          placeholder="pagination.next_token"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.totalField')" tight />
        <input
          v-model="model.totalField"
          :aria-label="t('sources.totalField')"
          type="text"
          placeholder="pagination.has_next"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.rangeCountField')" tight />
        <input
          v-model="model.rangeCountField"
          :aria-label="t('sources.rangeCountField')"
          type="text"
          placeholder="episodes"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.rangeCountValue')" tight />
        <input
          v-model.number="model.rangeCountValue"
          :aria-label="t('sources.rangeCountValue')"
          type="number"
          min="1"
          placeholder="12"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.rangeStartAt')" tight />
        <input
          v-model.number="model.rangeStartAt"
          :aria-label="t('sources.rangeStartAt')"
          type="number"
          min="0"
          placeholder="1"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.rangeTitleTemplate')" tight />
        <input
          v-model="model.rangeTitleTemplate"
          :aria-label="t('sources.rangeTitleTemplate')"
          type="text"
          :placeholder="$t('sources.episodeTemplatePlaceholder') + ' {n}'"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.fId')" tight />
        <input
          v-model="model.fId"
          :aria-label="t('sources.fId')"
          type="text"
          placeholder="mal_id"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.fType')" tight />
        <input
          v-model="model.fType"
          :aria-label="t('sources.fType')"
          type="text"
          placeholder="video"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.fDuration')" tight />
        <input
          v-model="model.fDuration"
          :aria-label="t('sources.fDuration')"
          type="text"
          placeholder="duration"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <FieldLabel :text="t('sources.fSourceUrl')" tight />
        <input
          v-model="model.fSourceUrl"
          :aria-label="t('sources.fSourceUrl')"
          type="text"
          placeholder="url"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  </details>
</template>
