<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Trash2, FlaskConical, Loader2, Layers } from '@lucide/vue';
import { buildSourceUrl } from '@renderer/utils/sourceUrl';
import { buildEndpointFromDraft, type DraftEndpoint, type DraftPassKey } from './endpointDraft';
import type { MediaSource } from '@renderer/types/sources';

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

function addPassKey(rows: DraftPassKey[]) {
  rows.push({ from: '', as: '', type: 'string' });
}
function removePassKey(rows: DraftPassKey[], i: number) {
  rows.splice(i, 1);
}

function fieldId(suffix: string): string {
  return `dl-${model.value.id}-${suffix}`;
}

function buildPreview(): string {
  const endpoint = buildEndpointFromDraft(model.value);
  if (!endpoint || !props.baseUrl.trim()) return '';
  const source: MediaSource = {
    id: 'preview',
    name: model.value.name.trim() || 'preview',
    baseUrl: props.baseUrl.trim(),
    auth: { type: 'none' },
    endpoints: [],
    createdAt: 0
  };
  const pageMode = !!endpoint.pagination?.pageParam && !endpoint.pagination.nextFromField;
  return buildSourceUrl(source, endpoint, {
    page: pageMode ? (endpoint.pagination?.pageStart ?? 1) : undefined
  });
}
</script>

<template>
  <div class="rounded-xl border border-border-default bg-bg-elevated/50 p-3 space-y-3">
    <div class="flex items-center gap-2">
      <span
        class="flex items-center gap-1.5 text-[11px] font-medium text-fg-faint uppercase tracking-wider"
      >
        <Layers :size="12" />
        {{ t('sources.level') }} {{ index + 1 }}
      </span>
      <div class="flex-1" />
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:text-red-base transition-colors"
        :aria-label="t('common.delete')"
        @click="emit('remove')"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <div class="flex items-center gap-2">
      <div
        class="flex rounded-lg overflow-hidden border border-border-default bg-bg-elevated text-xs"
      >
        <button
          class="px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.type === 'list' ? 'bg-accent-base text-white' : 'text-fg-muted hover:bg-bg-hover'
          "
          @click="model.type = 'list'"
        >
          {{ t('sources.typeList') }}
        </button>
        <button
          class="px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.type === 'page' ? 'bg-accent-base text-white' : 'text-fg-muted hover:bg-bg-hover'
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
        class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
      />
    </div>

    <div>
      <input
        v-model="model.path"
        type="text"
        :list="fieldId('path')"
        placeholder="/series/list"
        class="w-full px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
      />
      <datalist :id="fieldId('path')">
        <option v-for="k in availableKeys" :key="k" :value="`{${k}}`" />
      </datalist>
      <p v-if="availableKeys.length" class="text-[10px] text-fg-faint mt-1">
        {{ t('sources.availableKeys') }}:
        <code class="font-mono">{{ availableKeys.map((k) => '{' + k + '}').join(' ') }}</code>
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="block text-[10px] text-fg-faint uppercase tracking-wider">{{
        t('sources.display')
      }}</label>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <input
            v-model="model.fTitle"
            type="text"
            :list="fieldId('title')"
            :placeholder="t('sources.fTitle')"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
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
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
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
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
          <datalist :id="fieldId('sub')">
            <option v-for="o in fieldOptions" :key="o" :value="o" />
          </datalist>
        </div>
      </div>
    </div>

    <div>
      <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-1">{{
        t('sources.downloadField')
      }}</label>
      <input
        v-model="model.fMediaUrl"
        type="text"
        :list="fieldId('media')"
        :placeholder="t('sources.downloadNone')"
        class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
      />
      <datalist :id="fieldId('media')">
        <option v-for="o in fieldOptions" :key="o" :value="o" />
      </datalist>
    </div>
    <div>
      <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-1">{{
        t('sources.fPlayerUrl')
      }}</label>
      <input
        v-model="model.fPlayerUrl"
        type="text"
        :list="fieldId('player')"
        :placeholder="t('sources.fPlayerUrlPh')"
        class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
      />
      <datalist :id="fieldId('player')">
        <option v-for="o in fieldOptions" :key="o" :value="o" />
      </datalist>
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <label class="block text-[10px] text-fg-faint uppercase tracking-wider">{{
          t('sources.passKeys')
        }}</label>
        <button
          class="flex items-center gap-1 px-1.5 py-0.5 rounded text-accent-base text-[10px] font-medium hover:bg-accent-base/10 transition-colors"
          @click="addPassKey(model.passKeys)"
        >
          <Plus :size="10" />
          {{ t('sources.addPassKey') }}
        </button>
      </div>
      <div v-if="model.passKeys.length" class="space-y-1">
        <div v-for="(pk, i) in model.passKeys" :key="i" class="flex items-center gap-1.5">
          <input
            v-model="pk.from"
            type="text"
            :list="fieldId(`pk${i}`)"
            placeholder="slug"
            class="flex-1 min-w-0 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
          <datalist :id="fieldId(`pk${i}`)">
            <option v-for="o in fieldOptions" :key="o" :value="o" />
          </datalist>
          <span class="text-fg-faint text-xs">→</span>
          <input
            v-model="pk.as"
            type="text"
            placeholder="slug"
            class="w-24 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
          <select
            v-model="pk.type"
            class="px-1.5 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs focus:outline-none"
          >
            <option value="string">{{ t('sources.keyString') }}</option>
            <option value="number">{{ t('sources.keyNumber') }}</option>
          </select>
          <button
            class="p-1 rounded text-fg-faint hover:text-red-base transition-colors"
            :aria-label="t('common.delete')"
            @click="removePassKey(model.passKeys, i)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isPage"
      class="rounded-lg border border-border-default bg-bg-elevated/40 p-2.5 space-y-2"
    >
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 text-xs text-fg-muted select-none">
          <input v-model="model.tableEnabled" type="checkbox" class="accent-accent-base" />
          {{ t('sources.tableEnable') }}
        </label>
        <span class="flex-1" />
        <button
          class="flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
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
          <span class="text-[10px] text-fg-faint uppercase tracking-wider shrink-0">{{
            t('sources.tableSource')
          }}</span>
          <select
            v-model="model.tableMode"
            class="px-1.5 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs focus:outline-none"
          >
            <option value="endpoint">{{ t('sources.tableSourceEndpoint') }}</option>
            <option value="field">{{ t('sources.tableSourceField') }}</option>
          </select>
          <span class="text-[10px] text-fg-faint">{{ t(`sources.tableModeHint.${model.tableMode}`) }}</span>
        </div>
        <div v-if="model.tableMode === 'endpoint'">
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.tableEndpointPath')
          }}</label>
          <input
            v-model="model.tablePath"
            type="text"
            :list="fieldId('tpath')"
            :placeholder="t('sources.tableEndpointPathPh')"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
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
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.tableArrayField')
          }}</label>
          <input
            v-model="model.tableArrayField"
            type="text"
            :list="fieldId('tfield')"
            :placeholder="t('sources.tableArrayFieldPh')"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
          <datalist :id="fieldId('tfield')">
            <option v-for="o in fieldOptions" :key="o" :value="o" />
          </datalist>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] text-fg-faint mb-0.5">{{
              t('sources.tableRowTitle')
            }}</label>
            <input
              v-model="model.tableTitle"
              type="text"
              :list="fieldId('ttitle')"
              placeholder="Odcinek {n}"
              class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
            />
            <datalist :id="fieldId('ttitle')">
              <option v-for="o in rowOptions" :key="o" :value="`{${o}}`" />
            </datalist>
          </div>
<div>
              <label class="block text-[10px] text-fg-faint mb-0.5">{{
                t('sources.tableRowThumb')
              }}</label>
              <input
                v-model="model.tableThumbnail"
                type="text"
                :list="fieldId('tthumb')"
                placeholder="bg"
                class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
              <datalist :id="fieldId('tthumb')">
                <option v-for="o in rowOptions" :key="o" :value="o" />
              </datalist>
            </div>
            <div>
              <label class="block text-[10px] text-fg-faint mb-0.5">{{
                t('sources.tableRowPlayer')
              }}</label>
              <input
                v-model="model.tablePlayerUrl"
                type="text"
                :list="fieldId('tplayer')"
                :placeholder="t('sources.tableRowPlayerPh')"
                class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
              <datalist :id="fieldId('tplayer')">
                <option v-for="o in rowOptions" :key="o" :value="o" />
              </datalist>
            </div>
          <div>
            <label class="block text-[10px] text-fg-faint mb-0.5">{{
              t('sources.tableRowKey')
            }}</label>
            <input
              v-model="model.tableRowKey"
              type="text"
              :list="fieldId('trowkey')"
              placeholder="anime_episode_number"
              class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
            />
            <datalist :id="fieldId('trowkey')">
              <option v-for="o in rowOptions" :key="o" :value="o" />
            </datalist>
          </div>
        </div>
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="block text-[10px] text-fg-faint uppercase tracking-wider">{{
              t('sources.tableRowKeys')
            }}</label>
            <button
              class="flex items-center gap-1 px-1.5 py-0.5 rounded text-accent-base text-[10px] font-medium hover:bg-accent-base/10 transition-colors"
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
                class="flex-1 min-w-0 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
              <datalist :id="fieldId(`tpk${i}`)">
                <option v-for="o in rowOptions" :key="o" :value="o" />
              </datalist>
              <span class="text-fg-faint text-xs">→</span>
              <input
                v-model="pk.as"
                type="text"
                placeholder="n"
                class="w-24 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
              <select
                v-model="pk.type"
                class="px-1.5 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs focus:outline-none"
              >
                <option value="string">{{ t('sources.keyString') }}</option>
                <option value="number">{{ t('sources.keyNumber') }}</option>
              </select>
              <button
                class="p-1 rounded text-fg-faint hover:text-red-base transition-colors"
                :aria-label="t('common.delete')"
                @click="removePassKey(model.tablePassKeys, i)"
              >
                <Trash2 :size="12" />
              </button>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-1">{{
            t('sources.openRow')
          }}</label>
          <select
            v-model="model.tableChildId"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs focus:outline-none focus:ring-1 focus:ring-accent-base"
          >
            <option value="">{{ t('sources.noChild') }}</option>
            <option v-for="o in levelOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </div>
      </template>
    </div>

    <div v-else>
      <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-1">{{
        t('sources.openChild')
      }}</label>
      <select
        v-model="model.childId"
        class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs focus:outline-none focus:ring-1 focus:ring-accent-base"
      >
        <option value="">{{ t('sources.noChild') }}</option>
        <option v-for="o in levelOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
    </div>

    <details class="rounded-lg border border-border-default bg-bg-elevated/30">
      <summary
        class="px-2.5 py-1.5 text-[10px] text-fg-faint uppercase tracking-wider cursor-pointer select-none"
      >
        {{ t('sources.advanced') }}
      </summary>
      <div class="p-2.5 grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.method')
          }}</label>
          <select
            v-model="model.method"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.params')
          }}</label>
          <input
            v-model="model.paramsText"
            type="text"
            placeholder="rating=safe"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.arrayPath')
          }}</label>
          <input
            v-model="model.arrayPath"
            type="text"
            placeholder="data"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.pageParam')
          }}</label>
          <input
            v-model="model.pageParam"
            type="text"
            placeholder="page"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.startPage')
          }}</label>
          <input
            v-model.number="model.pageStart"
            type="number"
            min="1"
            placeholder="1"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.nextFromField')
          }}</label>
          <input
            v-model="model.nextFromField"
            type="text"
            placeholder="pagination.next_token"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.totalField')
          }}</label>
          <input
            v-model="model.totalField"
            type="text"
            placeholder="pagination.has_next"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.rangeCountField')
          }}</label>
          <input
            v-model="model.rangeCountField"
            type="text"
            placeholder="episodes"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.rangeCountValue')
          }}</label>
          <input
            v-model.number="model.rangeCountValue"
            type="number"
            min="1"
            placeholder="12"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.rangeStartAt')
          }}</label>
          <input
            v-model.number="model.rangeStartAt"
            type="number"
            min="0"
            placeholder="1"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.rangeTitleTemplate')
          }}</label>
          <input
            v-model="model.rangeTitleTemplate"
            type="text"
            placeholder="Odcinek {n}"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.fId')
          }}</label>
          <input
            v-model="model.fId"
            type="text"
            placeholder="mal_id"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.fType')
          }}</label>
          <input
            v-model="model.fType"
            type="text"
            placeholder="video"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.fDuration')
          }}</label>
          <input
            v-model="model.fDuration"
            type="text"
            placeholder="duration"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
        <div>
          <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">{{
            t('sources.fSourceUrl')
          }}</label>
          <input
            v-model="model.fSourceUrl"
            type="text"
            placeholder="url"
            class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
          />
        </div>
      </div>
    </details>

    <div class="flex items-center gap-2 pt-0.5">
      <button
        class="flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
        :disabled="testing"
        @click="emit('test')"
      >
        <Loader2 v-if="testing" :size="11" class="animate-spin" />
        <FlaskConical v-else :size="11" />
        {{ t('sources.test') }}
      </button>
      <span
        v-if="buildPreview()"
        class="text-[10px] font-mono text-fg-faint truncate flex-1 min-w-0"
        >{{ buildPreview() }}</span
      >
    </div>
  </div>
</template>
