<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  FlaskConical,
  Loader2,
  Plus,
  LayoutGrid,
  Images,
  GalleryHorizontalEnd,
  MonitorPlay,
  List
} from '@lucide/vue';
import type { DraftEndpoint, DraftPassKey } from '@renderer/components/sources/endpointDraft';
import FieldLabel from './FieldLabel.vue';
import PassKeyRow from './PassKeyRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

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

// Prezentacja wierszy tabeli: siatka (Tabela) lub karuzela/galeria/player.
const tableViews = [
  { id: 'table' as const, icon: LayoutGrid, labelKey: 'sources.viewTable' },
  { id: 'gallery' as const, icon: Images, labelKey: 'sources.viewGallery' },
  { id: 'compact' as const, icon: List, labelKey: 'sources.viewCompact' },
  { id: 'carousel' as const, icon: GalleryHorizontalEnd, labelKey: 'sources.viewCarousel' },
  { id: 'player' as const, icon: MonitorPlay, labelKey: 'sources.viewPlayer' }
];
</script>

<template>
  <div v-if="isPage" class="rounded-box border border-base-300 bg-base-100 p-3 space-y-2">
    <div class="flex items-center gap-2">
      <SettingsToggle v-model="model.tableEnabled" :label="t('sources.tableEnable')" />
      <span class="text-xs text-base-content/70 select-none">{{ t('sources.tableEnable') }}</span>
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
        <span class="text-[11px] text-base-content/50 uppercase tracking-wider shrink-0">{{
          t('sources.viewLabel')
        }}</span>
        <div
          class="flex rounded-field overflow-hidden border border-base-300 bg-base-100 text-xs"
          role="group"
          :aria-label="t('sources.viewLabel')"
        >
          <button
            v-for="v in tableViews"
            :key="v.id"
            class="fx-noise flex items-center gap-1 px-2 py-1 font-medium transition-colors"
            :class="
              model.tableView === v.id
                ? 'bg-primary text-primary-content'
                : 'text-base-content/70 hover:bg-base-content/10'
            "
            :title="t(v.labelKey)"
            :aria-label="t(v.labelKey)"
            :aria-pressed="model.tableView === v.id"
            @click="model.tableView = v.id"
          >
            <component :is="v.icon" :size="12" />
            <span class="hidden sm:inline">{{ t(v.labelKey) }}</span>
          </button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-base-content/50 uppercase tracking-wider shrink-0">{{
          t('sources.tableSource')
        }}</span>
        <select
          v-model="model.tableMode"
          class="px-1.5 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none"
        >
          <option value="endpoint">{{ t('sources.tableSourceEndpoint') }}</option>
          <option value="field">{{ t('sources.tableSourceField') }}</option>
        </select>
        <span class="text-[11px] text-base-content/50">{{
          t(`sources.tableModeHint.${model.tableMode}`)
        }}</span>
      </div>
      <div v-if="model.tableMode === 'endpoint'">
        <FieldLabel :text="t('sources.tableEndpointPath')" tight />
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
        <FieldLabel :text="t('sources.tableArrayField')" tight />
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
          <FieldLabel :text="t('sources.tableRowTitle')" :upper="false" tight />
          <input
            v-model="model.tableTitle"
            type="text"
            :list="fieldId('ttitle')"
            :placeholder="$t('sources.episodeTemplatePlaceholder') + ' {n}'"
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
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
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
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
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
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
            class="w-full px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <datalist :id="fieldId('trowkey')">
            <option v-for="o in rowOptions" :key="o" :value="o" />
          </datalist>
        </div>
      </div>
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <FieldLabel :text="t('sources.tableRowKeys')" tight />
          <button
            type="button"
            class="fx-noise flex items-center gap-1 px-1.5 py-0.5 fx-depth rounded-field text-primary text-[11px] font-medium hover:bg-primary/10 transition-colors"
            @click="addPassKey(model.tablePassKeys)"
          >
            <Plus :size="10" />
            {{ t('sources.addPassKey') }}
          </button>
        </div>
        <div v-if="model.tablePassKeys.length" class="space-y-1">
          <PassKeyRow
            v-for="(_, i) in model.tablePassKeys"
            :key="i"
            v-model="model.tablePassKeys[i]"
            :options="rowOptions"
            :id-base="fieldId(`tpk${i}`)"
            @remove="removePassKey(model.tablePassKeys, i)"
          />
        </div>
      </div>
      <div>
        <FieldLabel :text="t('sources.openRow')" />
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
