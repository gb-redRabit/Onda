import { ref, type ComputedRef, type Ref } from 'vue';
import type { MediaSource, SourceEndpoint, SourceItem } from '@renderer/types/sources';
import { itemPassContext, tableRowPassContext } from '@renderer/utils/sourcesNav';

export interface SourcesNavigationDeps {
  sources: Ref<MediaSource[]>;
  activeSourceId: Ref<string>;
  activeEndpointId: Ref<string>;
  activeEndpoint: ComputedRef<SourceEndpoint | null>;
  startPage: ComputedRef<number>;
  context: Ref<unknown>;
  currentPage: Ref<number>;
  resetItems: () => void;
  fetchItems: (query?: Record<string, string>) => Promise<void>;
}

// Navigation state (stack + per-source memory) and actions extracted from
// `stores/sources.ts` (plan 2.7). The store destructures the returned
// refs/actions back into the same names, so call sites are unchanged.
export function createSourcesNavigation(deps: SourcesNavigationDeps) {
  const {
    sources,
    activeSourceId,
    activeEndpointId,
    activeEndpoint,
    startPage,
    context,
    currentPage,
    resetItems,
    fetchItems
  } = deps;
  const navStack = ref<Array<{ endpointId: string; context: unknown }>>([]);
  /** Pamięć nawigacji per źródło (przełączenie nie kasuje ścieżki). */
  const navBySource = ref<
    Record<
      string,
      {
        stack: Array<{ endpointId: string; context: unknown }>;
        endpointId: string;
        context: unknown;
      }
    >
  >({});

  /** Reset elementów strony/stopki tabeli + powrót na stronę startową endpointu. */
  function resetForNavigation() {
    resetItems();
    currentPage.value = startPage.value;
  }

  function setActive(sourceId: string, endpointId?: string) {
    if (sourceId !== activeSourceId.value) {
      // Zachowaj nawigację bieżącego źródła przed przełączeniem.
      if (activeSourceId.value) {
        navBySource.value[activeSourceId.value] = {
          stack: [...navStack.value],
          endpointId: activeEndpointId.value,
          context: context.value
        };
      }
      activeSourceId.value = sourceId;
      const saved = navBySource.value[sourceId];
      if (saved && saved.endpointId) {
        activeEndpointId.value = saved.endpointId;
        navStack.value = saved.stack;
        context.value = saved.context;
      } else {
        activeEndpointId.value =
          endpointId || sources.value.find((s) => s.id === sourceId)?.endpoints[0]?.id || '';
        navStack.value = [];
        context.value = null;
      }
      resetForNavigation();
    } else if (endpointId && endpointId !== activeEndpointId.value) {
      activeEndpointId.value = endpointId;
      context.value = null;
      navStack.value = [];
      resetForNavigation();
    }
  }

  async function openItem(item: SourceItem) {
    const endpoint = activeEndpoint.value;
    if (!endpoint?.childId) return;
    navStack.value.push({ endpointId: endpoint.id, context: context.value });
    activeEndpointId.value = endpoint.childId;
    context.value = itemPassContext(item, endpoint);
    resetForNavigation();
    await fetchItems();
  }

  /** Zejście z wiersza tabeli poziomu 'page': kontekst = strona + wiersz (wiersz nadpisuje),
   *  klucze z passKeys strony, potem passKeys tabeli (wiersz wygrywa). */
  async function openTableRow(row: SourceItem) {
    const endpoint = activeEndpoint.value;
    const table = endpoint?.table;
    if (!table?.childId || !endpoint) return;
    navStack.value.push({ endpointId: endpoint.id, context: context.value });
    activeEndpointId.value = table.childId;
    context.value = tableRowPassContext(context.value, row, endpoint, table);
    resetForNavigation();
    await fetchItems();
  }

  async function goBackTo(depth: number) {
    const stack = navStack.value;
    if (depth < 0 || depth >= stack.length) return;
    const rootId = stack[0]?.endpointId;
    // depth = indeks wpisu w stacku, do którego wracamy: ostatni wpis to
    // endpoint, z którego przyszliśmy (goBack), a 0 = korzeń ścieżki.
    const entry = stack[depth];
    stack.splice(depth);
    activeEndpointId.value = entry ? entry.endpointId : (rootId ?? '');
    context.value = entry ? entry.context : null;
    resetForNavigation();
    await fetchItems();
  }

  async function goBack() {
    await goBackTo(navStack.value.length - 1);
  }

  function forgetSource(id: string) {
    delete navBySource.value[id];
  }

  function resetNavigation() {
    navStack.value = [];
    context.value = null;
  }

  return {
    navStack,
    setActive,
    openItem,
    openTableRow,
    goBack,
    goBackTo,
    forgetSource,
    resetNavigation
  };
}
