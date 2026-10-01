import { ref } from 'vue';
import { detectPlatform } from '@shared/platform';
import type { YouTubeResolveResult } from '@renderer/types/online';
import {
  mergeResolvedPage,
  normalizeResolvedTotal,
  type ResolveMoreResponse
} from '@renderer/utils/onlineResolved';
import { RESOLVED_AUTO_CAP } from '@renderer/utils/onlineResolveAll';

// Stan rozwiązanej playlisty (wynik rozwiązania linku/playlisty) + stronicowane loadery.
// Store destrukturyzuje zwrócone refy/akcje z powrotem do tych samych nazw, więc
// miejsca wywołań gdzie indziej pozostają bez zmian.
export function createOnlineResolved() {
  const resolved = ref<YouTubeResolveResult | null>(null);
  const isResolving = ref(false);
  const resolvedLoading = ref(false);
  const resolvedCapped = ref(false);
  const selectedResolved = ref<Set<string>>(new Set());
  let resolveLoadId = 0;

  function setResolved(result: YouTubeResolveResult | null) {
    resolveLoadId++;
    resolvedCapped.value = false;
    // Playlista, która mieści się na pierwszej stronie i nie podaje liczby, jest już
    // w pełni załadowana - długość items to jej dokładny total.
    result = normalizeResolvedTotal(result);
    resolved.value = result;
    resolvedLoading.value = false;
    selectedResolved.value = new Set(
      result ? result.items.filter((i) => i.isPlayable !== false).map((i) => i.id) : []
    );
    if (result && result.kind === 'playlist' && result.meta.hasMore) {
      void autoLoadResolved();
    }
  }

  // Ładuje jeszcze jedną stronę (30 elementów) rozwiązanej playlisty. Współdzielone przez
  // automatyczny loader i ręczny przycisk "załaduj więcej".
  async function loadResolvedPage(): Promise<boolean> {
    const r = resolved.value;
    if (!r || r.kind !== 'playlist' || !r.meta.hasMore) return false;
    // Dyspozycja po platformie - SC ustawia paginację przez sc:resolveMore.
    const moreChannel =
      detectPlatform(r.sourceUrl)?.platform === 'soundcloud' ? 'sc:resolveMore' : 'yt:resolveMore';
    const nextStart = r.items.length + 1;
    const res = (await window.api.invoke(moreChannel, {
      url: r.sourceUrl,
      start: nextStart,
      end: nextStart + 29
    })) as ResolveMoreResponse;
    if (!res || !res.success || !res.items || res.items.length === 0) return false;
    const { resolved: merged, fresh } = mergeResolvedPage(r, res);
    resolved.value = merged;
    const sel = new Set(selectedResolved.value);
    for (const it of fresh) {
      if (it.isPlayable !== false) sel.add(it.id);
    }
    selectedResolved.value = sel;
    return !!res.hasMore;
  }

  async function autoLoadResolved() {
    const loadId = resolveLoadId;
    resolvedLoading.value = true;
    try {
      while (resolved.value && resolved.value.kind === 'playlist' && resolved.value.meta.hasMore) {
        if (loadId !== resolveLoadId) return;
        if (resolved.value.items.length >= RESOLVED_AUTO_CAP) {
          resolvedCapped.value = true;
          break;
        }
        const hasMore = await loadResolvedPage();
        if (loadId !== resolveLoadId) return;
        if (!hasMore) break;
      }
      // Wszystkie elementy są teraz załadowane, więc dokładny total jest wreszcie znany.
      if (loadId === resolveLoadId && resolved.value && resolved.value.meta.totalItems == null) {
        const r = resolved.value;
        resolved.value = {
          ...r,
          meta: { ...r.meta, totalItems: r.items.length }
        };
      }
    } finally {
      if (loadId === resolveLoadId) resolvedLoading.value = false;
    }
  }

  async function loadMoreResolved() {
    if (resolvedLoading.value) return;
    resolvedLoading.value = true;
    try {
      const hasMore = await loadResolvedPage();
      resolvedCapped.value = hasMore;
    } finally {
      resolvedLoading.value = false;
    }
  }

  return {
    resolved,
    isResolving,
    resolvedLoading,
    resolvedCapped,
    selectedResolved,
    setResolved,
    autoLoadResolved,
    loadMoreResolved
  };
}
