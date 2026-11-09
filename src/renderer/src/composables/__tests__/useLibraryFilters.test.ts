import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';

const state = vi.hoisted(() => ({
  build: vi.fn(),
  filter: vi.fn(),
  terms: vi.fn(),
  library: null as any
}));

vi.mock('@renderer/utils/librarySearch', () => ({
  buildSearchIndex: state.build,
  filterSearchIndex: state.filter,
  searchableTerms: state.terms
}));

import { useLibraryFilters } from '../useLibraryFilters';

function track(id: string, type = 'audio') {
  return { id, name: id, path: `D:/${id}`, type } as never;
}

let app: any = null;

function setup() {
  let api: ReturnType<typeof useLibraryFilters> | null = null;
  app = createApp({
    setup() {
      api = useLibraryFilters(state.library);
      return () => h('div');
    }
  });
  app.mount(document.createElement('div'));
  return api as unknown as ReturnType<typeof useLibraryFilters>;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.build.mockReset();
  state.build.mockImplementation((tracks: unknown[], termsFn: (item: unknown) => unknown) => {
    tracks.forEach((item) => termsFn(item));
    return tracks;
  });
  state.filter.mockReset();
  state.filter.mockImplementation((index: any[], query: string) =>
    index.filter((item) => item.id.toLowerCase().includes(query.toLowerCase()))
  );
  state.terms.mockReset();
  state.terms.mockImplementation((item: any) => [item.name]);
  state.library = reactive({
    audioTracks: [track('alpha'), track('beta')],
    videoTracks: [track('video', 'video')],
    imageTracks: [track('image', 'image')],
    tracks: [track('alpha'), track('video', 'video'), track('image', 'image')],
    artists: [
      ['Alpha Artist', []],
      ['Beta Artist', []]
    ] as Array<[string, unknown[]]>,
    albums: [
      ['Alpha Album', []],
      ['Other', []]
    ] as Array<[string, unknown[]]>
  });
});

afterEach(() => {
  app?.unmount();
  app = null;
  vi.useRealTimers();
});

describe('search index', () => {
  it('builds indexes from every collection with searchable terms', async () => {
    const filters = setup();
    filters.query.value = 'a';
    await nextTick();
    vi.advanceTimersByTime(200);

    void filters.filteredTracks.value;
    void filters.filteredVideo.value;
    void filters.filteredImages.value;
    void filters.filteredAll.value;

    expect(state.build).toHaveBeenCalledTimes(4);
    expect(state.build.mock.calls[0][0]).toBe(state.library.audioTracks);
    expect(state.build.mock.calls[1][0]).toBe(state.library.videoTracks);
    expect(state.build.mock.calls[2][0]).toBe(state.library.imageTracks);
    expect(state.build.mock.calls[3][0]).toEqual([
      state.library.tracks[0],
      state.library.tracks[1]
    ]);
    expect(state.terms).toHaveBeenCalled();
  });

  it('rebuilds the index when the collection changes', async () => {
    const filters = setup();
    filters.query.value = 'a';
    await nextTick();
    vi.advanceTimersByTime(200);
    void filters.filteredTracks.value;
    const before = state.build.mock.calls.length;

    state.library.audioTracks = [track('gamma')];
    void filters.filteredTracks.value;

    expect(state.build.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('debounced query', () => {
  it('updates the debounced value after the delay', async () => {
    const filters = setup();
    expect(filters.debouncedQuery.value).toBe('');

    filters.query.value = 'alpha';
    await nextTick();
    vi.advanceTimersByTime(199);
    expect(filters.debouncedQuery.value).toBe('');

    vi.advanceTimersByTime(1);
    expect(filters.debouncedQuery.value).toBe('alpha');
  });

  it('restarts the timer for rapid input', async () => {
    const filters = setup();
    filters.query.value = 'a';
    await nextTick();
    vi.advanceTimersByTime(150);
    filters.query.value = 'ab';
    await nextTick();
    vi.advanceTimersByTime(199);
    expect(filters.debouncedQuery.value).toBe('');
    vi.advanceTimersByTime(1);
    expect(filters.debouncedQuery.value).toBe('ab');
  });

  it('trims whitespace when filtering', async () => {
    const filters = setup();
    filters.query.value = '  alpha  ';
    await nextTick();
    vi.advanceTimersByTime(200);

    expect(filters.filteredTracks.value.map((item) => item.id)).toEqual(['alpha']);
    expect(state.filter).toHaveBeenCalledWith(expect.anything(), 'alpha');
  });
});

describe('filtered collections', () => {
  it('returns unfiltered collections without a query', () => {
    const filters = setup();

    expect(filters.filteredTracks.value).toBe(state.library.audioTracks);
    expect(filters.filteredVideo.value).toBe(state.library.videoTracks);
    expect(filters.filteredImages.value).toBe(state.library.imageTracks);
    expect(filters.filteredArtists.value).toBe(state.library.artists);
    expect(filters.filteredAlbums.value).toBe(state.library.albums);
    expect(filters.filteredAll.value).toEqual([]);
    expect(state.filter).not.toHaveBeenCalled();
  });

  it('filters tracks, videos and images', async () => {
    const filters = setup();
    filters.query.value = 'e';
    await nextTick();
    vi.advanceTimersByTime(200);

    expect(filters.filteredTracks.value.map((item) => item.id)).toEqual(['beta']);
    expect(filters.filteredVideo.value.map((item) => item.id)).toEqual(['video']);
    expect(filters.filteredImages.value.map((item) => item.id)).toEqual(['image']);
  });

  it('filters artists and albums case-insensitively', async () => {
    const filters = setup();
    filters.query.value = 'ALPHA';
    await nextTick();
    vi.advanceTimersByTime(200);

    expect(filters.filteredArtists.value).toEqual([['Alpha Artist', []]]);
    expect(filters.filteredAlbums.value).toEqual([['Alpha Album', []]]);
  });

  it('filters the playable collection only when searching', async () => {
    const filters = setup();
    filters.query.value = 'video';
    await nextTick();
    vi.advanceTimersByTime(200);

    expect(filters.filteredAll.value.map((item) => item.id)).toEqual(['video']);
    expect(filters.filteredAll.value.some((item) => item.type === 'image')).toBe(false);
  });
});

describe('cleanup', () => {
  it('clears the pending debounce on unmount', async () => {
    const filters = setup();
    filters.query.value = 'pending';
    await nextTick();

    app.unmount();
    app = null;
    vi.advanceTimersByTime(500);

    expect(filters.debouncedQuery.value).toBe('');
  });
});
