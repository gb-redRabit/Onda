import { computed, ref } from 'vue';
import type { YouTubeVideo } from '@renderer/types/online';

const SEARCH_PAGE_SIZE = 20;

// Ujednolicone wyszukiwanie między platformami: zwykła fraza działa RÓWNOLEGLE na YouTube i
// SoundCloud (najpierw wyniki YT, dołączone SC) oraz stan paginacji
// dla obu. Udostępnione refy są destrukturyzowane z powrotem do store pod
// tymi samymi nazwami, więc miejsca wywołań gdzie indziej pozostają bez zmian.
export function createOnlineSearch() {
  const searchResults = ref<YouTubeVideo[]>([]);
  const searchQuery = ref('');
  const isSearching = ref(false);
  const nextToken = ref<string | null>(null);
  const prevToken = ref<string | null>(null);
  const searchPage = ref(0);
  const searchScOffset = ref(0);
  const hasMoreSc = ref(false);
  const searchLoadingMore = ref(false);
  // Rosnący token: wolniejsze wcześniejsze wyszukiwanie nie może nadpisać
  // paginacji (offsetu SC) ani wyników nowszego zapytania.
  let searchSeq = 0;

  async function searchOnline(query: string): Promise<{
    success?: boolean;
    error?: string;
    code?: string;
    items: YouTubeVideo[];
    nextPageToken?: string | null;
    prevPageToken?: string | null;
  }> {
    const seq = ++searchSeq;
    const [ytRes, scRes] = await Promise.allSettled([
      window.api.invoke('yt:search', query) as Promise<{
        success?: boolean;
        error?: string;
        code?: string;
        items?: YouTubeVideo[];
      }>,
      window.api.invoke('sc:search', query) as Promise<{
        success?: boolean;
        error?: string;
        code?: string;
        items?: YouTubeVideo[];
      }>
    ]);
    const ytItems =
      ytRes.status === 'fulfilled' && ytRes.value?.success ? ytRes.value.items || [] : [];
    const scItems =
      scRes.status === 'fulfilled' && scRes.value?.success ? scRes.value.items || [] : [];
    const anySuccess =
      (ytRes.status === 'fulfilled' && !!ytRes.value?.success) ||
      (scRes.status === 'fulfilled' && !!scRes.value?.success);
    if (anySuccess) {
      // Śledź paginację SC tylko jeśli to wciąż najnowsze wyszukiwanie — inaczej
      // starsza odpowiedź ustawiłaby offset dla nowego zapytania.
      if (seq === searchSeq) {
        searchScOffset.value = scItems.length;
        hasMoreSc.value = scItems.length >= 100;
      }
      return { success: true, items: [...ytItems, ...scItems] };
    }
    const ytError = ytRes.status === 'fulfilled' ? ytRes.value : undefined;
    return {
      success: false,
      error: ytError?.error || 'Search failed',
      code: ytError?.code,
      items: []
    };
  }

  // Dołącza następną stronę wyników SoundCloud (YT ogranicza się do pierwszej partii).
  async function loadMoreSearch(): Promise<void> {
    const q = searchQuery.value.trim();
    if (!q || searchLoadingMore.value || !hasMoreSc.value) return;
    // Migawka tokenu: jeśli w trakcie żądania startuje nowe wyszukiwanie, wynik
    // „załaduj więcej" należy do poprzedniego zapytania i jest odrzucany.
    const seq = searchSeq;
    searchLoadingMore.value = true;
    try {
      const res = (await window.api.invoke('sc:search', q, searchScOffset.value)) as {
        success?: boolean;
        items?: YouTubeVideo[];
      } | null;
      if (seq !== searchSeq) return;
      if (res?.success && res.items?.length) {
        const seen = new Set(searchResults.value.map((i) => i.id));
        searchResults.value = [...searchResults.value, ...res.items.filter((i) => !seen.has(i.id))];
        searchScOffset.value += res.items.length;
        hasMoreSc.value = res.items.length >= 100;
      } else {
        hasMoreSc.value = false;
      }
    } catch {
      if (seq === searchSeq) hasMoreSc.value = false;
    } finally {
      searchLoadingMore.value = false;
    }
  }

  const pagedResults = computed(() => {
    const start = searchPage.value * SEARCH_PAGE_SIZE;
    return searchResults.value.slice(start, start + SEARCH_PAGE_SIZE);
  });
  const hasNextPage = computed(
    () => (searchPage.value + 1) * SEARCH_PAGE_SIZE < searchResults.value.length
  );
  const hasPrevPage = computed(() => searchPage.value > 0);

  function setResults(results: YouTubeVideo[], nextPage?: string, prevPage?: string) {
    searchResults.value = results;
    searchPage.value = 0;
    nextToken.value = nextPage || null;
    prevToken.value = prevPage || null;
  }

  function nextSearchPage() {
    if (hasNextPage.value) searchPage.value++;
  }

  function prevSearchPage() {
    if (hasPrevPage.value) searchPage.value--;
  }

  return {
    searchResults,
    searchQuery,
    isSearching,
    nextToken,
    prevToken,
    searchPage,
    hasMoreSc,
    searchLoadingMore,
    pagedResults,
    hasNextPage,
    hasPrevPage,
    searchOnline,
    loadMoreSearch,
    setResults,
    nextSearchPage,
    prevSearchPage
  };
}
