<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { type DraftEndpoint } from './endpointDraft';

const { t } = useI18n();
const model = defineModel<DraftEndpoint>({ required: true });
</script>

<template>
  <details class="rounded-field border border-neutral-content/20 bg-neutral">
    <summary
      class="px-2.5 py-1.5 text-[10px] text-base-content/50 uppercase tracking-wider cursor-pointer select-none"
    >
      {{ t('sources.advanced') }}
    </summary>
    <div class="p-2.5 grid grid-cols-2 gap-2">
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.method')
        }}</label>
        <select
          v-model="model.method"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.params')
        }}</label>
        <input
          v-model="model.paramsText"
          type="text"
          placeholder="rating=safe"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.arrayPath')
        }}</label>
        <input
          v-model="model.arrayPath"
          type="text"
          placeholder="data"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.pageParam')
        }}</label>
        <input
          v-model="model.pageParam"
          type="text"
          placeholder="page"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.startPage')
        }}</label>
        <input
          v-model.number="model.pageStart"
          type="number"
          min="1"
          placeholder="1"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.nextFromField')
        }}</label>
        <input
          v-model="model.nextFromField"
          type="text"
          placeholder="pagination.next_token"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.totalField')
        }}</label>
        <input
          v-model="model.totalField"
          type="text"
          placeholder="pagination.has_next"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.rangeCountField')
        }}</label>
        <input
          v-model="model.rangeCountField"
          type="text"
          placeholder="episodes"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.rangeCountValue')
        }}</label>
        <input
          v-model.number="model.rangeCountValue"
          type="number"
          min="1"
          placeholder="12"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.rangeStartAt')
        }}</label>
        <input
          v-model.number="model.rangeStartAt"
          type="number"
          min="0"
          placeholder="1"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.rangeTitleTemplate')
        }}</label>
        <input
          v-model="model.rangeTitleTemplate"
          type="text"
          placeholder="Odcinek {n}"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.fId')
        }}</label>
        <input
          v-model="model.fId"
          type="text"
          placeholder="mal_id"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.fType')
        }}</label>
        <input
          v-model="model.fType"
          type="text"
          placeholder="video"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.fDuration')
        }}</label>
        <input
          v-model="model.fDuration"
          type="text"
          placeholder="duration"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.fSourceUrl')
        }}</label>
        <input
          v-model="model.fSourceUrl"
          type="text"
          placeholder="url"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  </details>
</template>
