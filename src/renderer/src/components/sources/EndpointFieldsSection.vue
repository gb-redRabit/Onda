<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DraftEndpoint } from './endpointDraft';

defineProps<{ availableKeys: string[]; fieldOptions: string[] }>();
const model = defineModel<DraftEndpoint>({ required: true });

function fieldId(suffix: string): string {
  return `dl-${model.value.id}-${suffix}`;
}

const { t } = useI18n();
</script>

<template>
  <div>
    <input
      v-model="model.path"
      type="text"
      :list="fieldId('path')"
      placeholder="/series/list"
      class="w-full px-2.5 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
    />
    <datalist :id="fieldId('path')">
      <option v-for="k in availableKeys" :key="k" :value="`{${k}}`" />
    </datalist>
    <p v-if="availableKeys.length" class="text-[10px] text-base-content/50 mt-1">
      {{ t('sources.availableKeys') }}:
      <code class="font-mono">{{ availableKeys.map((k) => '{' + k + '}').join(' ') }}</code>
    </p>
  </div>

  <div class="space-y-1.5">
    <label class="block text-[10px] text-base-content/50 uppercase tracking-wider">{{
      t('sources.display')
    }}</label>
    <div class="grid grid-cols-3 gap-2">
      <div>
        <input
          v-model="model.fTitle"
          type="text"
          :list="fieldId('title')"
          :placeholder="t('sources.fTitle')"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <datalist :id="fieldId('title')">
          <option v-for="o in fieldOptions" :key="o" :value="o" />
        </datalist>
      </div>
      <div>
        <input
          v-model="model.fThumbnail"
          type="text"
          :list="fieldId('thumb')"
          :placeholder="t('sources.fThumbnail')"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <datalist :id="fieldId('thumb')">
          <option v-for="o in fieldOptions" :key="o" :value="o" />
        </datalist>
      </div>
      <div>
        <input
          v-model="model.fSubtitle"
          type="text"
          :list="fieldId('sub')"
          :placeholder="t('sources.fSubtitle')"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <datalist :id="fieldId('sub')">
          <option v-for="o in fieldOptions" :key="o" :value="o" />
        </datalist>
      </div>
    </div>
  </div>

  <div>
    <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-1">{{
      t('sources.downloadField')
    }}</label>
    <input
      v-model="model.fMediaUrl"
      type="text"
      :list="fieldId('media')"
      :placeholder="t('sources.downloadNone')"
      class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
    />
    <datalist :id="fieldId('media')">
      <option v-for="o in fieldOptions" :key="o" :value="o" />
    </datalist>
  </div>
  <div>
    <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-1">{{
      t('sources.fPlayerUrl')
    }}</label>
    <input
      v-model="model.fPlayerUrl"
      type="text"
      :list="fieldId('player')"
      :placeholder="t('sources.fPlayerUrlPh')"
      class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
    />
    <datalist :id="fieldId('player')">
      <option v-for="o in fieldOptions" :key="o" :value="o" />
    </datalist>
  </div>
</template>
