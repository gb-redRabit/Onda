import { computed, ref } from 'vue';
import type { MediaSource } from '@renderer/types/sources';
import type { useSourcesStore } from '@renderer/stores/sources';
import { collectFieldPaths } from './endpointDraft';
import { applyPassKeys } from '@renderer/utils/sourceUrl';
import { tableRowPassContext } from '@renderer/utils/sourcesNav';

// Logika testu połączenia i diagnostyki edytora źródła (poziom listy i tabeli strony):
// próbki pól, surowa odpowiedź, nagłówki i status per endpoint. Wyodrębnione z
// `SourceEditorDialog.vue`, aby plik pozostał powłoką kreatora faz.
interface DraftLike {
  endpoints: Array<{
    id: string;
    type: string;
    tableEnabled: boolean;
    tableChildId?: string | null;
  }>;
}

export function useSourceEditorTest(deps: {
  sources: ReturnType<typeof useSourcesStore>;
  draft: DraftLike;
  buildSource: () => MediaSource | null;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const { sources, draft, buildSource, t } = deps;

  const testMsg = ref('');
  const testPassed = ref(false);
  const testingId = ref('');
  const tableTestingId = ref('');
  const sampleFields = ref<Record<string, string[]>>({});
  const pageSamples = ref<Record<string, Record<string, unknown>>>({});
  const rowSamples = ref<Record<string, string[]>>({});
  const testRaw = ref<unknown>(null);
  const testHeaders = ref<Record<string, string>>({});
  const headerRows = computed(() => Object.entries(testHeaders.value));
  const endpointStatus = ref<Record<string, boolean>>({});

  const prettyRaw = computed(() => {
    if (testRaw.value === null || testRaw.value === undefined) return '';
    try {
      return JSON.stringify(testRaw.value, null, 2);
    } catch {
      return String(testRaw.value);
    }
  });

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
        (await contextForLevel(idx)) ?? undefined,
        true
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

  async function onTest(idx: number): Promise<void> {
    testMsg.value = '';
    testRaw.value = null;
    testHeaders.value = {};
    const built = buildSource();
    if (!built) return;
    const endpoint = built.endpoints[idx];
    if (!endpoint) return;
    testingId.value = draft.endpoints[idx].id;
    try {
      const context = await contextForLevel(idx);
      const res = await sources.testSource(built, endpoint, context ?? undefined, true);
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

  async function onTestTable(idx: number): Promise<void> {
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

  return {
    testMsg,
    testPassed,
    testingId,
    tableTestingId,
    sampleFields,
    pageSamples,
    rowSamples,
    testRaw,
    testHeaders,
    headerRows,
    endpointStatus,
    prettyRaw,
    onTest,
    onTestTable
  };
}
