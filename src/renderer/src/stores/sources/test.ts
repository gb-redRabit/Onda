import { ref } from 'vue';
import type { MediaSource, SourceEndpoint, SourceItem } from '@renderer/types/sources';
import { toPlain } from '@renderer/utils/sources-helpers';

// Connection test state/actions extracted from `stores/sources.ts` (plan 2.7).
// The store destructures the returned refs/actions back into the same names,
// so call sites elsewhere are unchanged.
export function createSourcesTest() {
  /** Wynik ostatniego testu połączenia per źródło (sesja). */
  const testStatus = ref<Record<string, { success: boolean; error?: string }>>({});

  async function testSource(
    source: MediaSource,
    endpoint?: SourceEndpoint
  ): Promise<{ success: boolean; error?: string; sample?: SourceItem | null }> {
    try {
      const res = (await window.api.invoke(
        'sources:test',
        toPlain(source),
        endpoint ? toPlain(endpoint) : null
      )) as {
        success: boolean;
        error?: string;
        sample?: SourceItem | null;
      };
      testStatus.value[source.id] = { success: res.success, error: res.error };
      return res;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      testStatus.value[source.id] = { success: false, error: err };
      return { success: false, error: err };
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
  }

  return {
    testStatus,
    testSource,
    tableRowsTest,
    forgetSource
  };
}
