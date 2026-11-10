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

const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => yt }));
vi.mock('@shared/logger', () => ({
  logger: { warn: log.warn, info: vi.fn(), error: vi.fn() }
}));

import { useOnlineSearch } from '../useOnlineSearch';

const t = (key: string) => key;
const openDiscover = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  yt.isResolving = false;
  yt.isSearching = false;
  log.warn.mockClear();
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

describe('useOnlineSearch state and errors', () => {
  it('exposes resolvability for platform and plain http links', () => {
    const input = ref('lofi beats');
    const api = useOnlineSearch(input, t, openDiscover);
    expect(api.isResolvable.value).toBe(false);

    input.value = 'https://www.youtube.com/watch?v=abc12345678';
    expect(api.isResolvable.value).toBe(true);

    input.value = 'https://example.com/anything';
    expect(api.isResolvable.value).toBe(true);
  });

  it('ignores empty submissions', async () => {
    const api = useOnlineSearch(ref('   '), t, openDiscover);

    await api.search();
    await api.resolveLink();
    await api.submit();

    expect(yt.searchOnline).not.toHaveBeenCalled();
    expect(yt.resolveOnline).not.toHaveBeenCalled();
  });

  it('runs a successful search and stores pagination tokens', async () => {
    yt.searchOnline.mockResolvedValueOnce({
      success: true,
      items: [{ id: 'a' }],
      nextPageToken: 'next',
      prevPageToken: 'prev'
    });
    const api = useOnlineSearch(ref(' lofi '), t, openDiscover);

    await api.search();

    expect(openDiscover).toHaveBeenCalled();
    expect(yt.searchQuery).toBe(' lofi ');
    expect(yt.setResults).toHaveBeenCalledWith([{ id: 'a' }], 'next', 'prev');
    expect(yt.isSearching).toBe(false);
    expect(api.searchError.value).toBe('');
  });

  it('maps a known error code to its translation', async () => {
    yt.searchOnline.mockResolvedValueOnce({ success: false, code: 'network', items: [] });
    const api = useOnlineSearch(ref('lofi'), t, openDiscover);

    await api.search();

    expect(api.searchError.value).toBe('downloads.errorNetwork');
    expect(yt.setResults).toHaveBeenCalledWith([]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs unknown backend errors and uses the generic message', async () => {
    yt.searchOnline.mockResolvedValueOnce({
      success: false,
      error: 'raw backend text',
      items: []
    });
    const api = useOnlineSearch(ref('lofi'), t, openDiscover);

    await api.search();

    expect(log.warn).toHaveBeenCalledWith('yt', 'search failed: raw backend text');
    expect(api.searchError.value).toBe('youtube.searchError');
  });

  it('handles thrown search failures', async () => {
    yt.searchOnline.mockRejectedValueOnce(new Error('network'));
    const api = useOnlineSearch(ref('lofi'), t, openDiscover);

    await api.search();

    expect(api.searchError.value).toBe('youtube.searchError');
    expect(yt.isSearching).toBe(false);
  });

  it('drops a superseded search response', async () => {
    let releaseFirst!: (value: unknown) => void;
    yt.searchOnline
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ success: true, items: [{ id: 'second' }] });
    const api = useOnlineSearch(ref('lofi'), t, openDiscover);

    const first = api.search();
    const second = api.search();
    await second;
    releaseFirst({ success: true, items: [{ id: 'first' }] });
    await first;

    expect(yt.setResults).toHaveBeenCalledTimes(1);
    expect(yt.setResults).toHaveBeenCalledWith([{ id: 'second' }], undefined, undefined);
  });
});

describe('useOnlineSearch resolveLink', () => {
  it('resolves videos and playlists into the resolved panel', async () => {
    yt.resolveOnline.mockResolvedValueOnce({
      success: true,
      result: { kind: 'video', title: 'V' }
    });
    const api = useOnlineSearch(
      ref('https://www.youtube.com/watch?v=abc12345678'),
      t,
      openDiscover
    );

    await api.resolveLink();

    expect(yt.setResolved).toHaveBeenCalledWith({ kind: 'video', title: 'V' });
    expect(yt.isResolving).toBe(false);
  });

  it('opens channels directly', async () => {
    yt.resolveOnline.mockResolvedValueOnce({
      success: true,
      result: { kind: 'channel', sourceUrl: 'https://youtube.com/@a' }
    });
    const api = useOnlineSearch(ref('https://youtube.com/@a'), t, openDiscover);

    await api.resolveLink();

    expect(yt.setResolved).toHaveBeenCalledWith(null);
    expect(yt.openChannel).toHaveBeenCalledWith('https://youtube.com/@a');
  });

  it('maps resolve errors and logs unknown ones', async () => {
    yt.resolveOnline
      .mockResolvedValueOnce({ success: false, code: 'private' })
      .mockResolvedValueOnce({ success: false, error: 'raw' });
    const api = useOnlineSearch(ref('https://youtube.com/watch?v=abc12345678'), t, openDiscover);

    await api.resolveLink();
    expect(api.resolveError.value).toBe('downloads.errorPrivate');

    await api.resolveLink();
    expect(api.resolveError.value).toBe('youtube.resolveError');
    expect(log.warn).toHaveBeenCalledWith('yt', 'resolve failed: raw');
  });

  it('handles thrown resolve failures', async () => {
    yt.resolveOnline.mockRejectedValueOnce(new Error('offline'));
    const api = useOnlineSearch(ref('https://youtube.com/watch?v=abc12345678'), t, openDiscover);

    await api.resolveLink();

    expect(api.resolveError.value).toBe('youtube.resolveError');
    expect(yt.isResolving).toBe(false);
  });

  it('drops a superseded resolve response', async () => {
    let releaseFirst!: (value: unknown) => void;
    yt.resolveOnline
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ success: true, result: { kind: 'video', title: 'b' } });
    const api = useOnlineSearch(ref('https://youtube.com/watch?v=abc12345678'), t, openDiscover);

    const first = api.resolveLink();
    const second = api.resolveLink();
    await second;
    releaseFirst({ success: true, result: { kind: 'video', title: 'a' } });
    await first;

    expect(yt.setResolved.mock.calls.filter(([value]) => value !== null)).toEqual([
      [{ kind: 'video', title: 'b' }]
    ]);
  });
});

describe('useOnlineSearch prefixes and cancellation', () => {
  it('opens @name and $name prefixes directly', async () => {
    yt.openChannelPrefix.mockResolvedValue(undefined);
    const input = ref('@creator');
    const api = useOnlineSearch(input, t, openDiscover);

    await api.submit();

    expect(yt.openChannelPrefix).toHaveBeenCalledWith(expect.objectContaining({ name: 'creator' }));
    expect(yt.searchOnline).not.toHaveBeenCalled();
    expect(yt.resolveOnline).not.toHaveBeenCalled();
    expect(yt.isSearching).toBe(false);
    expect(yt.isResolving).toBe(false);
  });

  it('cancels pending searches and ignores their late results', async () => {
    let release!: (value: unknown) => void;
    yt.searchOnline.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const api = useOnlineSearch(ref('lofi'), t, openDiscover);

    const pending = api.search();
    api.cancelPending();
    expect(yt.isSearching).toBe(false);
    expect(yt.isResolving).toBe(false);

    release({ success: true, items: [{ id: 'late' }] });
    await pending;

    expect(yt.setResults).not.toHaveBeenCalled();
  });
});
