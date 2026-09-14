import { ref, type Ref } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';
import { errorCodeKey } from '@renderer/utils/errorCodes';

type Translate = (key: string, params?: Record<string, unknown>) => string;

// Unified online search action with stale-response guarding (a superseded
// search's result is discarded). Errors are exposed as a translated string.
export function useOnlineSearch(input: Ref<string>, t: Translate, openDiscover: () => void) {
  const yt = useOnlineStore();
  let searchSeq = 0;
  const searchError = ref('');

  async function search() {
    if (!input.value.trim()) return;
    openDiscover();
    yt.setResolved(null);
    yt.closeChannel();
    yt.isSearching = true;
    yt.searchQuery = input.value;
    searchError.value = '';
    const seq = ++searchSeq;
    try {
      const result = await yt.searchOnline(input.value);
      // Stale response from a superseded search — discard.
      if (seq !== searchSeq) return;
      if (result.success) {
        yt.setResults(
          result.items,
          result.nextPageToken ?? undefined,
          result.prevPageToken ?? undefined
        );
      } else {
        const key = errorCodeKey(result.code as never);
        searchError.value = key ? t(key) : result.error || t('youtube.searchError');
        yt.setResults([]);
      }
    } catch {
      searchError.value = t('youtube.searchError');
      yt.setResults([]);
    }
    if (seq === searchSeq) yt.isSearching = false;
  }

  return { searchError, search };
}
