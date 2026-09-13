<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Trash2, FlaskConical, Loader2, Layers } from '@lucide/vue';
import { type DraftEndpoint } from './endpointDraft';
import { buildEndpointPreview } from '@renderer/utils/endpointCard';
import EndpointPassKeys from './EndpointPassKeys.vue';
import EndpointTableConfig from './EndpointTableConfig.vue';

const { t } = useI18n();

const model = defineModel<DraftEndpoint>({ required: true });

const props = defineProps<{
  index: number;
  baseUrl: string;
  availableKeys: string[];
  /** Klucze, które ten poziom sam udostępnia (do ścieżki tabeli). */
  selfKeys?: string[];
  fieldOptions: string[];
  rowOptions: string[];
  levelOptions: Array<{ id: string; label: string }>;
  testing?: boolean;
  tableTesting?: boolean;
}>();

const emit = defineEmits<{
  test: [];
  'test-table': [];
  remove: [];
}>();

const isPage = computed(() => model.value.type === 'page');

function fieldId(suffix: string): string {
  return `dl-${model.value.id}-${suffix}`;
}

function buildPreview(): string {
  return buildEndpointPreview(model.value, props.baseUrl);
}
</script>

<template>
  <div class="rounded-box border border-neutral-content/20 bg-neutral p-3 space-y-3">
    <div class="flex items-center gap-2">
      <span
        class="flex items-center gap-1.5 text-[11px] font-medium text-base-content/50 uppercase tracking-wider"
      >
        <Layers :size="12" />
        {{ t('sources.level') }} {{ index + 1 }}
      </span>
      <div class="flex-1" />
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-error transition-colors"
        :aria-label="t('common.delete')"
        @click="emit('remove')"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <div class="flex items-center gap-2">
      <div class="flex rounded-field overflow-hidden border border-base-300 bg-base-100 text-xs">
        <button
          class="px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.type === 'list'
              ? 'bg-primary text-primary-content'
              : 'text-base-content/70 hover:bg-base-content/10'
          "
          @click="model.type = 'list'"
        >
          {{ t('sources.typeList') }}
        </button>
        <button
          class="px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.type === 'page'
              ? 'bg-primary text-primary-content'
              : 'text-base-content/70 hover:bg-base-content/10'
          "
          @click="model.type = 'page'"
        >
          {{ t('sources.typePage') }}
        </button>
      </div>
      <input
        v-model="model.name"
        type="text"
        :placeholder="t('sources.endpointName')"
        class="flex-1 min-w-0 px-2.5 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>

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

    <EndpointPassKeys
      v-model:pass-keys="model.passKeys"
      :model-id="model.id"
      :field-options="fieldOptions"
    />

    <EndpointTableConfig
      v-if="isPage"
      v-model="model"
      :field-options="fieldOptions"
      :row-options="rowOptions"
      :available-keys="availableKeys"
      :self-keys="props.selfKeys"
      :level-options="levelOptions"
      :table-testing="tableTesting"
      @test-table="emit('test-table')"
    />

    <div v-else>
      <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-1">{{
        t('sources.openChild')
      }}</label>
      <select
        v-model="model.childId"
        class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">{{ t('sources.noChild') }}</option>
        <option v-for="o in levelOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
    </div>

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

    <div class="flex items-center gap-2 pt-0.5">
      <button
        class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
        :disabled="testing"
        @click="emit('test')"
      >
        <Loader2 v-if="testing" :size="11" class="animate-spin" />
        <FlaskConical v-else :size="11" />
        {{ t('sources.test') }}
      </button>
      <span
        v-if="buildPreview()"
        class="text-[10px] font-mono text-base-content/50 truncate flex-1 min-w-0"
        >{{ buildPreview() }}</span
      >
    </div>
  </div>
</template>
