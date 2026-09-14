import { computed, ref, type Ref } from 'vue';
import { useOnlineStore } from '@renderer/stores/online';
import { detectChannelPrefix, detectPlatform } from '@shared/platform';
import { errorCodeKey } from '@renderer/utils/errorCodes';

type Translate = (key: string, params?: Record<string, unknown>) => string;

// Unified online search/resolve actions with stale-response guarding (a
// superseded request's result is discarded). Errors are exposed as translated
// strings. `openDiscover` switches the view back to the discover section.
export function useOnlineSearch(input: Ref<string>, t: Translate, openDiscover: () => void) {
  const yt = useOnlineStore();
  let searchSeq = 0;
  let resolveSeq = 0;
  const searchError = ref('');
  const resolveError = ref('');

  // A pasted input is "resolvable" when it is a direct link of ANY supported
  // platform — it then resolves to a track/playlist/profile instead of a search.
  const isResolvable = computed(() => detectPlatform(input.value) !== null);

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

  async function resolveLink() {
    const url = input.value.trim();
    if (!url) return;
    openDiscover();
    yt.isResolving = true;
    resolveError.value = '';
    const seq = ++resolveSeq;
    try {
      const res = await yt.resolveOnline(url);
      // Stale response from a superseded resolve — discard.
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
    // @name -> YouTube channel, $name -> SoundCloud profile: open directly.
    const prefix = detectChannelPrefix(input.value);
    if (prefix) {
      openDiscover();
      yt.setResolved(null);
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

  return { isResolvable, searchError, resolveError, search, resolveLink, submit };
}
