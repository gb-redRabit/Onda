import { computed, ref } from 'vue';
import type { YouTubeVideo } from '@renderer/types/online';

const SEARCH_PAGE_SIZE = 20;

// Unified search across platforms: a plain phrase runs on BOTH YouTube and
// SoundCloud in parallel (YT results first, SC appended) and the pagination
// state for both. Exposed refs are destructured back into the store under the
// same names, so call sites elsewhere are unchanged.
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

  async function searchOnline(query: string): Promise<{
    success?: boolean;
    error?: string;
    code?: string;
    items: YouTubeVideo[];
    nextPageToken?: string | null;
    prevPageToken?: string | null;
  }> {
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
      // Track SC pagination: a full page means deeper offsets exist.
      searchScOffset.value = scItems.length;
      hasMoreSc.value = scItems.length >= 100;
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

  // Appends the next SoundCloud result page (YT caps at its first batch).
  async function loadMoreSearch(): Promise<void> {
    const q = searchQuery.value.trim();
    if (!q || searchLoadingMore.value || !hasMoreSc.value) return;
    searchLoadingMore.value = true;
    try {
      const res = (await window.api.invoke('sc:search', q, searchScOffset.value)) as {
        success?: boolean;
        items?: YouTubeVideo[];
      } | null;
      if (res?.success && res.items?.length) {
        const seen = new Set(searchResults.value.map((i) => i.id));
        searchResults.value = [...searchResults.value, ...res.items.filter((i) => !seen.has(i.id))];
        searchScOffset.value += res.items.length;
        hasMoreSc.value = res.items.length >= 100;
      } else {
        hasMoreSc.value = false;
      }
    } catch {
      hasMoreSc.value = false;
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
