import { ref } from 'vue';
import type { MediaSource, SourceEndpoint, SourceItem } from '@renderer/types/sources';
import { toPlain } from '@renderer/utils/sources-helpers';

// Stan/akcje testu połączenia wyodrębnione z `stores/sources.ts` (plan 2.7).
// Store destrukturyzuje zwrócone refy/akcje z powrotem do tych samych nazw,
// więc miejsca wywołań gdzie indziej pozostają bez zmian.
export function createSourcesTest() {
  /** Wynik ostatniego testu połączenia per źródło (sesja). */
  const testStatus = ref<
    Record<string, { success: boolean; error?: string; at?: number; ms?: number }>
  >({});
  /** Trwa test połączenia dla danego źródła (do wskaźnika „sprawdzanie"). */
  const checking = ref<Record<string, boolean>>({});

  async function testSource(
    source: MediaSource,
    endpoint?: SourceEndpoint,
    context?: unknown
  ): Promise<{
    success: boolean;
    error?: string;
    sample?: SourceItem | null;
    raw?: unknown;
    headers?: Record<string, string>;
  }> {
    checking.value[source.id] = true;
    const started = Date.now();
    try {
      const res = (await window.api.invoke(
        'sources:test',
        toPlain(source),
        endpoint ? toPlain(endpoint) : null,
        context === undefined ? null : toPlain(context)
      )) as {
        success: boolean;
        error?: string;
        sample?: SourceItem | null;
        raw?: unknown;
        headers?: Record<string, string>;
      };
      testStatus.value[source.id] = {
        success: res.success,
        error: res.error,
        at: Date.now(),
        ms: Date.now() - started
      };
      return res;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      testStatus.value[source.id] = {
        success: false,
        error: err,
        at: Date.now(),
        ms: Date.now() - started
      };
      return { success: false, error: err };
    } finally {
      checking.value[source.id] = false;
    }
  }

  async function tableRowsTest(
    source: MediaSource,
    endpoint: SourceEndpoint,
    context?: unknown
  ): Promise<SourceItem[]> {
    try {
      return (await window.api.invoke('sources:tableRows', toPlain(source), toPlain(endpoint), {
        context: toPlain(context)
      })) as SourceItem[];
    } catch {
      return [];
    }
  }

  /** Edycja/usunięcie źródła unieważnia zapamiętany status testu. */
  function forgetSource(id: string) {
    delete testStatus.value[id];
    delete checking.value[id];
  }

  return {
    testStatus,
    checking,
    testSource,
    tableRowsTest,
    forgetSource
  };
}
