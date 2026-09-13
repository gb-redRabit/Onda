<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FlaskConical, Loader2, Plus, Trash2 } from '@lucide/vue';
import type { DraftEndpoint, DraftPassKey } from '@renderer/components/sources/endpointDraft';

const props = defineProps<{
  fieldOptions: string[];
  rowOptions: string[];
  availableKeys: string[];
  selfKeys?: string[];
  levelOptions: Array<{ id: string; label: string }>;
  tableTesting?: boolean;
}>();
const emit = defineEmits<{ 'test-table': [] }>();
const model = defineModel<DraftEndpoint>({ required: true });

const isPage = computed(() => model.value.type === 'page');

function fieldId(suffix: string): string {
  return `dl-${model.value.id}-${suffix}`;
}

function addPassKey(rows: DraftPassKey[]) {
  rows.push({ from: '', as: '', type: 'string' });
}

function removePassKey(rows: DraftPassKey[], i: number) {
  rows.splice(i, 1);
}

const { t } = useI18n();
</script>

<template>
  <div
    v-if="isPage"
    class="rounded-field border border-neutral-content/20 bg-neutral p-2.5 space-y-2"
  >
    <div class="flex items-center gap-2">
      <label class="flex items-center gap-1.5 text-xs text-base-content/70 select-none">
        <input v-model="model.tableEnabled" type="checkbox" class="accent-primary" />
        {{ t('sources.tableEnable') }}
      </label>
      <span class="flex-1" />
      <button
        class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
        :disabled="tableTesting"
        :title="t('sources.testTableHint')"
        @click="emit('test-table')"
      >
        <Loader2 v-if="tableTesting" :size="11" class="animate-spin" />
        <FlaskConical v-else :size="11" />
        {{ t('sources.testTable') }}
      </button>
    </div>
    <template v-if="model.tableEnabled">
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-base-content/50 uppercase tracking-wider shrink-0">{{
          t('sources.tableSource')
        }}</span>
        <select
          v-model="model.tableMode"
          class="px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none"
        >
          <option value="endpoint">{{ t('sources.tableSourceEndpoint') }}</option>
          <option value="field">{{ t('sources.tableSourceField') }}</option>
        </select>
        <span class="text-[10px] text-base-content/50">{{
          t(`sources.tableModeHint.${model.tableMode}`)
        }}</span>
      </div>
      <div v-if="model.tableMode === 'endpoint'">
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.tableEndpointPath')
        }}</label>
        <input
          v-model="model.tablePath"
          type="text"
          :list="fieldId('tpath')"
          :placeholder="t('sources.tableEndpointPathPh')"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <datalist :id="fieldId('tpath')">
          <option
            v-for="k in props.selfKeys?.length ? props.selfKeys : availableKeys"
            :key="k"
            :value="`/.../{${k}}`"
          />
        </datalist>
      </div>
      <div v-else>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-0.5">{{
          t('sources.tableArrayField')
        }}</label>
        <input
          v-model="model.tableArrayField"
          type="text"
          :list="fieldId('tfield')"
          :placeholder="t('sources.tableArrayFieldPh')"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <datalist :id="fieldId('tfield')">
          <option v-for="o in fieldOptions" :key="o" :value="o" />
        </datalist>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] text-base-content/50 mb-0.5">{{
            t('sources.tableRowTitle')
          }}</label>
          <input
            v-model="model.tableTitle"
            type="text"
            :list="fieldId('ttitle')"
            placeholder="Odcinek {n}"
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist :id="fieldId('ttitle')">
            <option v-for="o in rowOptions" :key="o" :value="`{${o}}`" />
          </datalist>
        </div>
        <div>
          <label class="block text-[10px] text-base-content/50 mb-0.5">{{
            t('sources.tableRowThumb')
          }}</label>
          <input
            v-model="model.tableThumbnail"
            type="text"
            :list="fieldId('tthumb')"
            placeholder="bg"
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist :id="fieldId('tthumb')">
            <option v-for="o in rowOptions" :key="o" :value="o" />
          </datalist>
        </div>
        <div>
          <label class="block text-[10px] text-base-content/50 mb-0.5">{{
            t('sources.tableRowPlayer')
          }}</label>
          <input
            v-model="model.tablePlayerUrl"
            type="text"
            :list="fieldId('tplayer')"
            :placeholder="t('sources.tableRowPlayerPh')"
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist :id="fieldId('tplayer')">
            <option v-for="o in rowOptions" :key="o" :value="o" />
          </datalist>
        </div>
        <div>
          <label class="block text-[10px] text-base-content/50 mb-0.5">{{
            t('sources.tableRowKey')
          }}</label>
          <input
            v-model="model.tableRowKey"
            type="text"
            :list="fieldId('trowkey')"
            placeholder="anime_episode_number"
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist :id="fieldId('trowkey')">
            <option v-for="o in rowOptions" :key="o" :value="o" />
          </datalist>
        </div>
      </div>
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <label class="block text-[10px] text-base-content/50 uppercase tracking-wider">{{
            t('sources.tableRowKeys')
          }}</label>
          <button
            class="fx-noise flex items-center gap-1 px-1.5 py-0.5 fx-depth rounded-field text-primary text-[10px] font-medium hover:bg-primary/10 transition-colors"
            @click="addPassKey(model.tablePassKeys)"
          >
            <Plus :size="10" />
            {{ t('sources.addPassKey') }}
          </button>
        </div>
        <div v-if="model.tablePassKeys.length" class="space-y-1">
          <div v-for="(pk, i) in model.tablePassKeys" :key="i" class="flex items-center gap-1.5">
            <input
              v-model="pk.from"
              type="text"
              :list="fieldId(`tpk${i}`)"
              placeholder="anime_episode_number"
              class="flex-1 min-w-0 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <datalist :id="fieldId(`tpk${i}`)">
              <option v-for="o in rowOptions" :key="o" :value="o" />
            </datalist>
            <span class="text-base-content/50 text-xs">→</span>
            <input
              v-model="pk.as"
              type="text"
              placeholder="n"
              class="w-24 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              v-model="pk.type"
              class="px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none"
            >
              <option value="string">{{ t('sources.keyString') }}</option>
              <option value="number">{{ t('sources.keyNumber') }}</option>
            </select>
            <button
              class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-error transition-colors"
              :aria-label="t('common.delete')"
              @click="removePassKey(model.tablePassKeys, i)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>
      <div>
        <label class="block text-[10px] text-base-content/50 uppercase tracking-wider mb-1">{{
          t('sources.openRow')
        }}</label>
        <select
          v-model="model.tableChildId"
          class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{{ t('sources.noChild') }}</option>
          <option v-for="o in levelOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
        </select>
      </div>
    </template>
  </div>
</template>
