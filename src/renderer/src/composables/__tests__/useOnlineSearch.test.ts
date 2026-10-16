import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// Siatka regresyjna kompozycji wyszukiwania Online: provider linków ma pierwszeństwo
// nad ścieżkami YouTube/SoundCloud; zwykłe zapytania i linki YT działają bez zmian.

const yt = vi.hoisted(() => ({
  isResolving: false,
  isSearching: false,
  searchQuery: '',
  setResolved: vi.fn(),
  closeChannel: vi.fn(),
  setResults: vi.fn(),
  resolveOnline: vi.fn(),
  searchOnline: vi.fn(),
  openChannel: vi.fn(),
  openChannelPrefix: vi.fn()
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => yt }));

import { useOnlineSearch } from '../useOnlineSearch';

const t = (key: string) => key;
const openDiscover = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  yt.isResolving = false;
  yt.isSearching = false;
});

describe('useOnlineSearch provider priority', () => {
  it('hands a provider link to onProvider and stops before YT/SoundCloud', async () => {
    const input = ref('https://mypikpak.com/s/SHARE1');
    const onProvider = vi.fn(async () => true);
    const { submit } = useOnlineSearch(input, t, openDiscover, onProvider);
    await submit();
    expect(onProvider).toHaveBeenCalledWith('https://mypikpak.com/s/SHARE1');
    expect(yt.resolveOnline).not.toHaveBeenCalled();
    expect(yt.searchOnline).not.toHaveBeenCalled();
  });

  it('falls through to search when no provider matches', async () => {
    const input = ref('lofi beats');
    const onProvider = vi.fn(async () => false);
    yt.searchOnline.mockResolvedValueOnce({ success: true, items: [] });
    const { submit } = useOnlineSearch(input, t, openDiscover, onProvider);
    await submit();
    expect(onProvider).toHaveBeenCalled();
    expect(yt.searchOnline).toHaveBeenCalledWith('lofi beats');
  });

  it('resolves a YouTube link when no provider matches', async () => {
    const input = ref('https://www.youtube.com/watch?v=abc12345678');
    const onProvider = vi.fn(async () => false);
    yt.resolveOnline.mockResolvedValueOnce({ success: true, result: { kind: 'video', items: [] } });
    const { submit } = useOnlineSearch(input, t, openDiscover, onProvider);
    await submit();
    expect(onProvider).toHaveBeenCalled();
    expect(yt.resolveOnline).toHaveBeenCalled();
  });

  it('works without an onProvider callback (backward compatible)', async () => {
    const input = ref('lofi beats');
    yt.searchOnline.mockResolvedValueOnce({ success: true, items: [] });
    const { submit } = useOnlineSearch(input, t, openDiscover);
    await submit();
    expect(yt.searchOnline).toHaveBeenCalledWith('lofi beats');
  });
});
