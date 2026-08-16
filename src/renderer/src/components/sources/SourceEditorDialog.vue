<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, Plus, Loader2, Globe, Link2, Trash2 } from '@lucide/vue';
import { useSourcesStore } from '@renderer/stores/sources';
import { useSettingsStore } from '@renderer/stores/settings';
import EndpointLevelCard from './EndpointLevelCard.vue';
import {
  emptyEndpoint,
  endpointFromSource,
  buildEndpointFromDraft,
  collectFieldPaths,
  randomId
} from './endpointDraft';
import type { MediaSource, SourceAuthType, SourceEndpoint } from '@renderer/types/sources';

const { t } = useI18n();

const props = defineProps<{
  source: MediaSource | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const sources = useSourcesStore();
const settings = useSettingsStore();

const draft = reactive({
  id: props.source?.id || '',
  name: props.source?.name || '',
  icon: props.source?.icon || '',
  baseUrl: props.source?.baseUrl || '',
  authType: (props.source?.auth?.type || 'none') as SourceAuthType,
  apiKeyId: props.source?.auth?.apiKeyId || '',
  headerName: props.source?.auth?.headerName || '',
  queryParam: props.source?.auth?.queryParam || '',
  downloadOutputDir: props.source?.download?.outputDir || '',
  downloadFolder: props.source?.download?.folder ?? settings.download.sourcesFolder,
  endpoints: (props.source?.endpoints || []).map((e) => endpointFromSource(e))
});

const saving = ref(false);
const errorMsg = ref('');
const testMsg = ref('');
const testPassed = ref(false);
const testingId = ref('');
const tableTestingId = ref('');
const sampleFields = ref<Record<string, string[]>>({});
const pageSamples = ref<Record<string, Record<string, unknown>>>({});
const rowSamples = ref<Record<string, string[]>>({});
const defaultDownloadDir = ref('');
const iconUrl = ref('');

const iconValid = computed(
  () =>
    !!draft.icon &&
    (/^data:image\//i.test(draft.icon) || /^https?:\/\//i.test(draft.icon))
);

onMounted(async () => {
  defaultDownloadDir.value = (await window.api.invoke('sources:downloadDir')) as string;
});

async function pickDownloadDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths[0]) draft.downloadOutputDir = paths[0];
}

async function pickIconFile() {
  const res = (await window.api.invoke('sources:pickIcon')) as {
    success: boolean;
    dataUrl?: string;
    error?: string;
  };
  if (res.success && res.dataUrl) {
    draft.icon = res.dataUrl;
    iconUrl.value = '';
  } else if (res.error) {
    errorMsg.value = res.error;
  }
}

function applyIconUrl() {
  const url = iconUrl.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    errorMsg.value = t('sources.iconUrlInvalid');
    return;
  }
  draft.icon = url;
}

function clearIcon() {
  draft.icon = '';
  iconUrl.value = '';
}

const apiKeyOptions = computed(() =>
  (settings.apiKeys?.keys || [])
    .filter((k) => k.isActive)
    .map((k) => ({ id: k.id, label: k.name || k.service || k.id }))
);

/** Klucze (nazwy placeholderów) przekazywane przez poprzedni poziom. */
function availableKeys(idx: number): string[] {
  const prev = draft.endpoints[idx - 1];
  return prev ? prev.passKeys.map((k) => k.as.trim()).filter(Boolean) : [];
}

/** Klucze, które ten poziom sam udostępnia (np. do ścieżki tabeli). */
function selfKeys(idx: number): string[] {
  return draft.endpoints[idx].passKeys.map((k) => k.as.trim()).filter(Boolean);
}

function levelOptions(idx: number): Array<{ id: string; label: string }> {
  return draft.endpoints
    .filter((_o, i) => i !== idx)
    .map((o) => ({ id: o.id, label: o.name.trim() || o.path || o.id }));
}

function syncChain() {
  const ids = new Set(draft.endpoints.map((e) => e.id));
  for (let i = 0; i < draft.endpoints.length; i++) {
    const ep = draft.endpoints[i];
    const next = draft.endpoints[i + 1]?.id || '';
    if (ep.type === 'page') {
      const cur = ep.tableChildId;
      ep.tableChildId = cur && ids.has(cur) ? cur : next;
    } else {
      const cur = ep.childId;
      ep.childId = cur && ids.has(cur) ? cur : next;
    }
  }
}

function addLevel() {
  draft.endpoints.push(emptyEndpoint());
  syncChain();
}

function removeLevel(idx: number) {
  draft.endpoints.splice(idx, 1);
  syncChain();
}

function buildAuth() {
  if (draft.authType === 'none') return { type: 'none' as const };
  const base = { type: draft.authType, apiKeyId: draft.apiKeyId || undefined } as {
    type: SourceAuthType;
    apiKeyId?: string;
    headerName?: string;
    queryParam?: string;
  };
  if (draft.authType === 'apikey') {
    base.headerName = draft.headerName.trim() || undefined;
    base.queryParam = draft.queryParam.trim() || undefined;
  }
  return base;
}

function buildSource(): MediaSource | null {
  const name = draft.name.trim();
  const baseUrl = draft.baseUrl.trim();
  if (!name) {
    errorMsg.value = t('sources.errNameRequired');
    return null;
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    errorMsg.value = t('sources.errBaseUrl');
    return null;
  }
  const endpoints: SourceEndpoint[] = [];
  for (const e of draft.endpoints) {
    const ep = buildEndpointFromDraft(e);
    if (ep) endpoints.push(ep);
  }
  if (!endpoints.length) {
    errorMsg.value = t('sources.errEndpointRequired');
    return null;
  }
  return {
    id: draft.id || randomId(),
    name,
    icon: draft.icon.trim() || undefined,
    baseUrl,
    auth: buildAuth(),
    endpoints,
    download:
      draft.downloadOutputDir.trim() || !draft.downloadFolder
        ? {
            outputDir: draft.downloadOutputDir.trim() || undefined,
            folder: draft.downloadFolder
          }
        : undefined,
    createdAt: props.source?.createdAt ?? Date.now()
  };
}

async function onSave() {
  errorMsg.value = '';
  const built = buildSource();
  if (!built) return;
  saving.value = true;
  try {
    const res = await sources.saveSource(built);
    if (res.ok) {
      emit('saved');
      emit('close');
    } else {
      errorMsg.value = res.error || t('sources.errSaveFailed');
    }
  } finally {
    saving.value = false;
  }
}

async function onTest(idx: number) {
  errorMsg.value = '';
  testMsg.value = '';
  const built = buildSource();
  if (!built) return;
  const endpoint = built.endpoints[idx];
  if (!endpoint) return;
  testingId.value = draft.endpoints[idx].id;
  try {
    const res = await sources.testSource(built, endpoint);
    testPassed.value = res.success;
    testMsg.value = res.success
      ? t('sources.testOk', { n: built.endpoints.length })
      : t('sources.testFail', { err: res.error || 'unknown' });
    if (res.success && res.sample) {
      sampleFields.value = {
        ...sampleFields.value,
        [draft.endpoints[idx].id]: collectFieldPaths(res.sample.extra)
      };
      if (res.sample.extra) {
        pageSamples.value = {
          ...pageSamples.value,
          [draft.endpoints[idx].id]: res.sample.extra as Record<string, unknown>
        };
      }
    }
  } finally {
    testingId.value = '';
  }
}

async function onTestTable(idx: number) {
  errorMsg.value = '';
  testMsg.value = '';
  const built = buildSource();
  if (!built) return;
  const endpoint = built.endpoints[idx];
  const context = pageSamples.value[draft.endpoints[idx].id];
  if (!endpoint) return;
  if (!context) {
    testPassed.value = false;
    testMsg.value = t('sources.testTableHint');
    return;
  }
  tableTestingId.value = draft.endpoints[idx].id;
  try {
    const rows = await sources.tableRowsTest(built, endpoint, context);
    testPassed.value = rows.length > 0;
    testMsg.value = rows.length
      ? t('sources.testTableOk', { n: rows.length })
      : t('sources.testTableFail');
    if (rows[0]?.extra) {
      rowSamples.value = {
        ...rowSamples.value,
        [draft.endpoints[idx].id]: collectFieldPaths(rows[0].extra)
      };
    }
  } finally {
    tableTestingId.value = '';
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-3xl max-h-full flex flex-col rounded-2xl bg-bg-surface border border-border-default shadow-2xl overflow-hidden"
      >
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <h2 class="text-sm font-medium flex-1">
            {{ props.source ? $t('sources.editSource') : $t('sources.addSource') }}
          </h2>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label
                class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider mb-1"
              >
                {{ $t('sources.name') }}
              </label>
              <input
                v-model="draft.name"
                type="text"
                :placeholder="$t('sources.namePlaceholder')"
                class="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
            </div>
            <div>
              <label
                class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider mb-1"
              >
                {{ $t('sources.baseUrl') }}
              </label>
              <input
                v-model="draft.baseUrl"
                type="text"
                placeholder="https://api.example.com"
                class="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
            </div>
          </div>

          <div class="space-y-2 rounded-xl border border-border-default bg-bg-elevated/50 p-3">
            <label class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider">
              {{ $t('sources.iconSection') }}
            </label>
            <div class="flex items-start gap-3">
              <div
                class="w-12 h-12 shrink-0 rounded-lg bg-bg-elevated border border-border-default flex items-center justify-center overflow-hidden"
              >
                <img v-if="iconValid" :src="draft.icon" class="w-full h-full object-cover" />
                <Globe v-else :size="20" class="text-fg-faint" />
              </div>
              <div class="flex-1 min-w-0 space-y-2">
                <div class="flex items-center gap-2">
                  <button
                    class="shrink-0 px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
                    @click="pickIconFile"
                  >
                    {{ $t('sources.iconFromPc') }}
                  </button>
                  <input
                    v-model="iconUrl"
                    type="text"
                    :placeholder="$t('sources.iconUrlPlaceholder')"
                    class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                    @keyup.enter="applyIconUrl"
                  />
                  <button
                    class="shrink-0 p-2 rounded-lg text-fg-muted hover:bg-bg-hover transition-colors"
                    :title="$t('sources.iconApplyUrl')"
                    @click="applyIconUrl"
                  >
                    <Link2 :size="14" />
                  </button>
                  <button
                    v-if="draft.icon"
                    class="shrink-0 p-2 rounded-lg text-fg-muted hover:bg-red-base/10 hover:text-red-base transition-colors"
                    :title="$t('sources.iconClear')"
                    @click="clearIcon"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
                <p class="text-[10px] text-fg-faint">{{ $t('sources.iconHint') }}</p>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider">
              {{ $t('sources.auth') }}
            </label>
            <div class="flex flex-wrap gap-2">
              <select
                v-model="draft.authType"
                class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
              >
                <option value="none">{{ $t('sources.authNone') }}</option>
                <option value="apikey">{{ $t('sources.authApiKey') }}</option>
                <option value="bearer">{{ $t('sources.authBearer') }}</option>
              </select>
              <template v-if="draft.authType !== 'none'">
                <select
                  v-model="draft.apiKeyId"
                  class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
                >
                  <option value="">{{ $t('sources.chooseKey') }}</option>
                  <option v-for="k in apiKeyOptions" :key="k.id" :value="k.id">
                    {{ k.label }}
                  </option>
                </select>
                <template v-if="draft.authType === 'apikey'">
                  <input
                    v-model="draft.headerName"
                    type="text"
                    :placeholder="$t('sources.headerName')"
                    class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                  <input
                    v-model="draft.queryParam"
                    type="text"
                    :placeholder="$t('sources.queryParam')"
                    class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </template>
              </template>
            </div>
          </div>

          <div class="space-y-2 rounded-xl border border-border-default bg-bg-elevated/50 p-3">
            <label class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider">
              {{ $t('sources.downloadSection') }}
            </label>
            <div>
              <label
                class="block text-[10px] text-fg-faint uppercase tracking-wider mb-1"
              >
                {{ $t('sources.downloadOutputDir') }}
              </label>
              <div class="flex items-center gap-2">
                <input
                  v-model="draft.downloadOutputDir"
                  type="text"
                  :placeholder="defaultDownloadDir"
                  class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                />
                <button
                  class="shrink-0 px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
                  @click="pickDownloadDir"
                >
                  {{ $t('sources.chooseFolder') }}
                </button>
              </div>
              <p class="text-[10px] text-fg-faint mt-1">
                {{ $t('sources.downloadDefaultHint', { path: defaultDownloadDir }) }}
              </p>
            </div>
            <label class="flex items-center gap-2 text-xs text-fg-muted select-none">
              <input v-model="draft.downloadFolder" type="checkbox" class="accent-accent-base" />
              {{ $t('sources.downloadFolder') }}
            </label>
            <p class="text-[10px] text-fg-faint">
              {{ $t('sources.downloadFolderHint') }}
            </p>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-[11px] font-medium text-fg-faint uppercase tracking-wider">
                {{ $t('sources.levels') }}
              </label>
              <button
                class="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent-base/10 text-accent-base text-xs font-medium hover:bg-accent-base/20 transition-colors"
                @click="addLevel"
              >
                <Plus :size="12" />
                {{ $t('sources.addLevel') }}
              </button>
            </div>

            <EndpointLevelCard
              v-for="(ep, idx) in draft.endpoints"
              :key="ep.id"
              v-model="draft.endpoints[idx]"
              :index="idx"
              :base-url="draft.baseUrl"
              :available-keys="availableKeys(idx)"
              :self-keys="selfKeys(idx)"
              :field-options="sampleFields[ep.id] || []"
              :row-options="rowSamples[ep.id] || []"
              :level-options="levelOptions(idx)"
              :testing="testingId === ep.id"
              :table-testing="tableTestingId === ep.id"
              @test="onTest(idx)"
              @test-table="onTestTable(idx)"
              @remove="removeLevel(idx)"
            />
          </div>

          <p
            v-if="testMsg"
            class="text-xs"
            :class="testPassed ? 'text-green-base' : 'text-red-base'"
          >
            {{ testMsg }}
          </p>
          <p v-if="errorMsg" class="text-xs text-red-base">{{ errorMsg }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-fg-muted hover:bg-bg-hover transition-colors"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-sm font-medium hover:bg-accent-strong transition-colors flex items-center gap-1.5"
            :disabled="saving"
            @click="onSave"
          >
            <Loader2 v-if="saving" :size="14" class="animate-spin" />
            {{ $t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
