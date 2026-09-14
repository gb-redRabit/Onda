<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Trash2, FlaskConical, Loader2, Layers } from '@lucide/vue';
import { type DraftEndpoint } from './endpointDraft';
import { buildEndpointPreview } from '@renderer/utils/endpointCard';
import EndpointPassKeys from './EndpointPassKeys.vue';
import EndpointTableConfig from './EndpointTableConfig.vue';
import EndpointFieldsSection from './EndpointFieldsSection.vue';
import EndpointAdvancedSection from './EndpointAdvancedSection.vue';

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

    <EndpointFieldsSection
      v-model="model"
      :available-keys="availableKeys"
      :field-options="fieldOptions"
    />

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

    <EndpointAdvancedSection v-model="model" />

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
