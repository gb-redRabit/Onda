<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { useUnsavedGuard } from '@renderer/composables/useUnsavedGuard';
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, Loader2, ChevronLeft, ChevronRight } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import { useSourcesStore } from '@renderer/stores/sources';
import { useSettingsStore } from '@renderer/stores/settings';
import SourcePhaseRail from './SourcePhaseRail.vue';
import type { PhaseItem } from './sourcePhases';
import SourcePhaseBasics from './SourcePhaseBasics.vue';
import SourcePhaseTest from './SourcePhaseTest.vue';
import EndpointPhasePane from './EndpointPhasePane.vue';
import {
  emptyEndpoint,
  endpointFromSource,
  buildEndpointFromDraft,
  collectFieldPaths,
  randomId
} from './endpointDraft';
import type { MediaSource, SourceAuthType, SourceEndpoint } from '@renderer/types/sources';
import { buildSourceAuth, syncEndpointChain } from '@renderer/utils/sourceEditor';
import { applyPassKeys } from '@renderer/utils/sourceUrl';
import { tableRowPassContext } from '@renderer/utils/sourcesNav';

const { t } = useI18n();

const props = defineProps<{
  source: MediaSource | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const ui = useUIStore();
const sources = useSourcesStore();
const settings = useSettingsStore();
const { onOverlayClick } = useUnsavedGuard({
  isDirty: () =>
    draft.name.trim() !== (props.source?.name || '') ||
    draft.baseUrl.trim() !== (props.source?.baseUrl || '') ||
    draft.allowPrivateNetwork !== (props.source?.allowPrivateNetwork === true) ||
    draft.endpoints.length !== (props.source?.endpoints?.length || 0),
  onClose: () => emit('close'),
  onDirtyHint: () => ui.notify('warning', t('common.unsavedChangesClickAgain')),
  onCleanHint: () => ui.notify('info', t('common.clickAgainToClose'))
});

const draft = reactive({
  id: props.source?.id || '',
  name: props.source?.name || '',
  icon: props.source?.icon || '',
  baseUrl: props.source?.baseUrl || '',
  allowPrivateNetwork: props.source?.allowPrivateNetwork === true,
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
/** Surowa odpowiedź JSON z ostatniego testu (podgląd diagnostyczny). */
const testRaw = ref<unknown>(null);
/** Nagłówki odpowiedzi z ostatniego testu (wartości wrażliwe zamaskowane w main). */
const testHeaders = ref<Record<string, string>>({});
const headerRows = computed(() => Object.entries(testHeaders.value));

// Wynik ostatniego testu per endpoint (id) — steruje znaczkami statusu w szynie faz.
const endpointStatus = ref<Record<string, boolean>>({});

// Edytor jako kreator faz: 0 = Źródło, 1..N = kolejne endpointy łańcucha, N+1 = Test.
const activePhase = ref(0);
const phasesCount = computed(() => draft.endpoints.length + 2);
const currentEndpointIndex = computed(() =>
  activePhase.value >= 1 && activePhase.value <= draft.endpoints.length ? activePhase.value - 1 : -1
);

const sourceValid = computed(
  () => !!draft.name.trim() && /^https?:\/\//i.test(draft.baseUrl.trim())
);

const railPhases = computed<PhaseItem[]>(() => [
  {
    key: 'source',
    kind: 'source',
    label: draft.name.trim() || t('sources.phaseSource'),
    status: sourceValid.value ? null : 'invalid'
  },
  ...draft.endpoints.map((e, i) => {
    const tested = endpointStatus.value[e.id];
    return {
      key: e.id,
      kind: 'endpoint' as const,
      label: e.name.trim() || e.path.trim() || `${t('sources.level')} ${i + 1}`,
      type: e.type,
      status:
        tested === true
          ? ('ok' as const)
          : tested === false
            ? ('fail' as const)
            : e.path.trim()
              ? null
              : ('invalid' as const)
    };
  }),
  { key: 'test', kind: 'test', label: t('sources.phaseTest'), status: null }
]);

const saveHint = computed(
  () => !props.source && (draft.authType !== 'none' || draft.allowPrivateNetwork)
);

const prettyRaw = computed(() => {
  if (testRaw.value === null || testRaw.value === undefined) return '';
  try {
    return JSON.stringify(testRaw.value, null, 2);
  } catch {
    return String(testRaw.value);
  }
});

onMounted(async () => {
  defaultDownloadDir.value = (await window.api.invoke('sources:downloadDir')) as string;
});

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
  syncEndpointChain(draft.endpoints);
}

/** Dopina nowy endpoint na końcu łańcucha i przechodzi do jego fazy. */
function addLevel() {
  draft.endpoints.push(emptyEndpoint());
  syncChain();
  activePhase.value = draft.endpoints.length;
}

/** Usuwa endpoint (indeks fazy = endpoint + 1), przepina łańcuch i koryguje aktywną fazę. */
function removeLevel(idx: number) {
  draft.endpoints.splice(idx, 1);
  syncChain();
  if (activePhase.value > idx + 1) activePhase.value -= 1;
  activePhase.value = Math.min(activePhase.value, phasesCount.value - 1);
}

function selectPhase(index: number): void {
  activePhase.value = index;
}

function prevPhase(): void {
  activePhase.value = Math.max(0, activePhase.value - 1);
}

function nextPhase(): void {
  activePhase.value = Math.min(phasesCount.value - 1, activePhase.value + 1);
}

function buildAuth() {
  return buildSourceAuth(draft);
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
    allowPrivateNetwork: draft.allowPrivateNetwork,
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

/** Zdobywa (raz) próbkę surowego JSON poziomu `idx`, testując go z jego własnym kontekstem. */
async function ensureLevelSample(
  idx: number
): Promise<{ raw: Record<string, unknown> | null; built: MediaSource | null }> {
  const endpoint = draft.endpoints[idx];
  let raw = pageSamples.value[endpoint.id] ?? null;
  const built = buildSource();
  if (!built) return { raw: null, built: null };
  if (!raw) {
    const res = await sources.testSource(
      built,
      built.endpoints[idx],
      (await contextForLevel(idx)) ?? undefined
    );
    if (res.success && res.sample?.extra) {
      raw = res.sample.extra as Record<string, unknown>;
      pageSamples.value = { ...pageSamples.value, [endpoint.id]: raw };
    }
  }
  return { raw, built };
}

/**
 * Kontekst dla testu poziomu `idx`, taki jak przy realnej nawigacji w dół:
 *  - dziecko wiersza tabeli strony → strona + pierwszy wiersz tabeli (passKeys strony i tabeli),
 *  - dziecko elementu listy → element + passKeys rodzica.
 * Gdy brakuje próbki rodzica, dociągamy ją, testując poziom wyżej.
 */
async function contextForLevel(idx: number): Promise<Record<string, unknown> | null> {
  if (idx <= 0) return null;
  const parentDraft = draft.endpoints[idx - 1];
  const childDraft = draft.endpoints[idx];
  const { raw, built } = await ensureLevelSample(idx - 1);
  if (!raw || !built) return null;
  const parentEndpoint = built.endpoints[idx - 1];
  if (
    parentDraft.type === 'page' &&
    parentDraft.tableEnabled &&
    parentDraft.tableChildId === childDraft.id &&
    parentEndpoint.table
  ) {
    const rows = await sources.tableRowsTest(built, parentEndpoint, raw);
    const row = rows[0];
    if (!row) return null;
    return tableRowPassContext(raw, row, parentEndpoint, parentEndpoint.table);
  }
  return applyPassKeys(raw, parentEndpoint.passKeys);
}

async function onTest(idx: number) {
  errorMsg.value = '';
  testMsg.value = '';
  testRaw.value = null;
  testHeaders.value = {};
  const built = buildSource();
  if (!built) return;
  const endpoint = built.endpoints[idx];
  if (!endpoint) return;
  testingId.value = draft.endpoints[idx].id;
  try {
    // Poziom zagnieżdżony potrzebuje kontekstu (placeholdery {x} w ścieżce/parametrach).
    const context = await contextForLevel(idx);
    const res = await sources.testSource(built, endpoint, context ?? undefined);
    testPassed.value = res.success;
    endpointStatus.value = { ...endpointStatus.value, [endpoint.id]: res.success };
    testMsg.value = res.success
      ? t('sources.testOk', { n: built.endpoints.length })
      : t('sources.testFail', { err: res.error || 'unknown' });
    if (res.success) {
      testRaw.value = res.raw ?? res.sample?.extra ?? null;
      testHeaders.value = res.headers ?? {};
    }
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
  <ModalShell
    labelled-by="source-editor-dialog-title"
    data-testid="source-editor-dialog"
    panel-class="w-full max-w-5xl max-h-full flex flex-col overflow-hidden"
    @close="onOverlayClick"
    @escape="emit('close')"
  >
    <div class="flex items-center gap-3 px-4 py-3 border-b border-base-300">
      <h2 id="source-editor-dialog-title" class="text-sm font-medium flex-1">
        {{ props.source ? $t('sources.editSource') : $t('sources.addSource') }}
      </h2>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
        :aria-label="$t('common.close')"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <div class="flex-1 min-h-0 flex">
      <SourcePhaseRail
        :phases="railPhases"
        :active="activePhase"
        @select="selectPhase"
        @add="addLevel"
        @remove="removeLevel($event - 1)"
      />

      <div class="flex-1 min-w-0 overflow-y-auto px-4 py-4">
        <SourcePhaseBasics
          v-if="activePhase === 0"
          v-model:name="draft.name"
          v-model:icon="draft.icon"
          v-model:base-url="draft.baseUrl"
          v-model:allow-private-network="draft.allowPrivateNetwork"
          v-model:auth-type="draft.authType"
          v-model:api-key-id="draft.apiKeyId"
          v-model:header-name="draft.headerName"
          v-model:query-param="draft.queryParam"
          v-model:download-output-dir="draft.downloadOutputDir"
          v-model:download-folder="draft.downloadFolder"
          :default-download-dir="defaultDownloadDir"
          :api-key-options="apiKeyOptions"
          @error="errorMsg = $event"
        />

        <EndpointPhasePane
          v-else-if="currentEndpointIndex >= 0"
          v-model="draft.endpoints[currentEndpointIndex]"
          :base-url="draft.baseUrl"
          :available-keys="availableKeys(currentEndpointIndex)"
          :self-keys="selfKeys(currentEndpointIndex)"
          :field-options="sampleFields[draft.endpoints[currentEndpointIndex]?.id || ''] || []"
          :row-options="rowSamples[draft.endpoints[currentEndpointIndex]?.id || ''] || []"
          :level-options="levelOptions(currentEndpointIndex)"
          :testing="testingId === draft.endpoints[currentEndpointIndex]?.id"
          :table-testing="tableTestingId === draft.endpoints[currentEndpointIndex]?.id"
          @test="onTest(currentEndpointIndex)"
          @test-table="onTestTable(currentEndpointIndex)"
        />

        <SourcePhaseTest
          v-else
          :save-hint="saveHint"
          :test-msg="testMsg"
          :test-passed="testPassed"
          :pretty-raw="prettyRaw"
          :header-rows="headerRows"
          :error-msg="errorMsg"
          @test="onTest(0)"
        />
      </div>
    </div>

    <div class="flex items-center gap-2 px-4 py-3 border-t border-base-300">
      <button
        class="fx-noise flex items-center gap-1 px-2.5 py-1.5 fx-depth rounded-field text-sm text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-40"
        :disabled="activePhase === 0"
        @click="prevPhase"
      >
        <ChevronLeft :size="14" />
        {{ $t('common.back') }}
      </button>
      <button
        class="fx-noise flex items-center gap-1 px-2.5 py-1.5 fx-depth rounded-field text-sm text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-40"
        :disabled="activePhase >= phasesCount - 1"
        @click="nextPhase"
      >
        {{ $t('common.next') }}
        <ChevronRight :size="14" />
      </button>
      <span class="flex-1" />
      <button
        class="fx-noise px-3 py-1.5 fx-depth rounded-field text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="emit('close')"
      >
        {{ $t('common.cancel') }}
      </button>
      <button
        class="fx-noise px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
        :disabled="saving"
        @click="onSave"
      >
        <Loader2 v-if="saving" :size="14" class="animate-spin" />
        {{ $t('common.save') }}
      </button>
    </div>
  </ModalShell>
</template>
