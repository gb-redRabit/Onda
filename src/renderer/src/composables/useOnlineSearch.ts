import { computed, ref, type Ref } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';
import { detectChannelPrefix, detectPlatform, isHttpUrl } from '@shared/platform';
import { errorCodeKey } from '@renderer/utils/errorCodes';

type Translate = (key: string, params?: Record<string, unknown>) => string;

// Ujednolicone akcje wyszukiwania/rozwiązywania online z ochroną przed nieaktualnymi
// odpowiedziami (wynik zastąpionego żądania jest odrzucany). Błędy są udostępniane jako
// przetłumaczone ciągi. `openDiscover` przełącza widok z powrotem na sekcję odkrywania.
export function useOnlineSearch(input: Ref<string>, t: Translate, openDiscover: () => void) {
  const yt = useOnlineStore();
  let searchSeq = 0;
  let resolveSeq = 0;
  const searchError = ref('');
  const resolveError = ref('');

  // Wklejone wejście jest "rozwiązywalne", gdy jest bezpośrednim linkiem DOWOLNEJ obsługiwanej
  // platformy — wtedy rozwiązuje się do utworu/playlisty/profilu zamiast wyszukiwania.
  const isResolvable = computed(
    () => detectPlatform(input.value) !== null || isHttpUrl(input.value)
  );

  async function search() {
    if (!input.value.trim()) return;
    resolveSeq++;
    yt.isResolving = false;
    openDiscover();
    resolveError.value = '';
    yt.setResolved(null);
    yt.closeChannel();
    yt.isSearching = true;
    yt.searchQuery = input.value;
    searchError.value = '';
    const seq = ++searchSeq;
    try {
      const result = await yt.searchOnline(input.value);
      // Nieaktualna odpowiedź z zastąpionego wyszukiwania — odrzuć.
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

  async function resolveLink() {
    const url = input.value.trim();
    if (!url) return;
    searchSeq++;
    yt.isSearching = false;
    openDiscover();
    yt.closeChannel();
    yt.setResolved(null);
    yt.setResults([]);
    searchError.value = '';
    yt.isResolving = true;
    resolveError.value = '';
    const seq = ++resolveSeq;
    try {
      const res = await yt.resolveOnline(url);
      // Nieaktualna odpowiedź z zastąpionego rozwiązywania — odrzuć.
      if (seq !== resolveSeq) return;
      if (res.success && res.result) {
        if (res.result.kind === 'channel') {
          yt.setResolved(null);
          await yt.openChannel(res.result.sourceUrl);
        } else {
          yt.setResults([]);
          yt.setResolved(res.result);
        }
      } else {
        const key = errorCodeKey(res.code);
        resolveError.value = key ? t(key) : res.error || t('youtube.resolveError');
      }
    } catch {
      resolveError.value = t('youtube.resolveError');
    } finally {
      if (seq === resolveSeq) yt.isResolving = false;
    }
  }

  async function submit() {
    if (!input.value.trim()) return;
    // @name -> kanał YouTube, $name -> profil SoundCloud: otwórz bezpośrednio.
    const prefix = detectChannelPrefix(input.value);
    if (prefix) {
      searchSeq++;
      resolveSeq++;
      yt.isSearching = false;
      yt.isResolving = false;
      openDiscover();
      searchError.value = '';
      resolveError.value = '';
      yt.setResolved(null);
      yt.setResults([]);
      yt.closeChannel();
      await yt.openChannelPrefix(prefix);
      return;
    }
    if (isResolvable.value) {
      await resolveLink();
    } else {
      await search();
    }
  }

  function cancelPending(): void {
    searchSeq++;
    resolveSeq++;
    yt.isSearching = false;
    yt.isResolving = false;
  }

  return { isResolvable, searchError, resolveError, search, resolveLink, submit, cancelPending };
}
