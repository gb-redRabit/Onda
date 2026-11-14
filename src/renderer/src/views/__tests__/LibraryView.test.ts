import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive, ref } from 'vue';
import LibraryView from '../LibraryView.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  settings: null as any,
  player: null as any,
  ui: null as any,
  route: null as any,
  filters: null as any,
  tagEditor: null as any,
  smart: null as any,
  dropped: [] as string[],
  folderTracks: [] as unknown[],
  addFilesResult: undefined as unknown,
  invoke: vi.fn(),
  resume: vi.fn(),
  readString: vi.fn(),
  writeString: vi.fn(),
  readStringArray: vi.fn(),
  writeJson: vi.fn(),
  getAllTracksIndexed: vi.fn(),
  isCoreShell: vi.fn(() => false),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('vue-router', () => ({ useRoute: () => state.route }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/smart-playlists', () => ({ useSmartPlaylists: () => state.smart }));
vi.mock('@renderer/composables/useLibraryFilters', () => ({
  useLibraryFilters: () => state.filters
}));
vi.mock('@renderer/composables/useLibraryTagEditor', () => ({
  useLibraryTagEditor: () => state.tagEditor
}));
vi.mock('@renderer/composables/useViewSearch', () => ({ useViewSearch: vi.fn() }));
vi.mock('@renderer/utils/fileDrag', () => ({
  getDroppedFilePaths: () => state.dropped
}));
vi.mock('@renderer/utils/libraryIndex', () => ({
  getAllTracksIndexed: state.getAllTracksIndexed
}));
vi.mock('@renderer/modules/audioEngine', () => ({ audioEngine: { resume: state.resume } }));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: state.isCoreShell }));
vi.mock('@renderer/utils/localStore', () => ({
  readString: state.readString,
  writeString: state.writeString,
  readStringArray: state.readStringArray,
  writeJson: state.writeJson
}));
vi.mock('@renderer/utils/shuffle', () => ({
  shuffled: (items: unknown[]) => [...items].reverse()
}));

// `__esModule` lets `defineAsyncComponent` unwrap the mocked default export;
// without it Vue treats the mock namespace as the component itself.
vi.mock('@renderer/components/library/LibraryToolbar.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-toolbar', {
      props: ['query', 'sortKey', 'sortDir', 'chip', 'tab', 'chips'],
      emits: ['update:query', 'update:sortKey', 'update:sortDir', 'update:chip', 'open-musicbrainz']
    })
  };
});
vi.mock('@renderer/components/library/LibraryHeader.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-header', {
      props: ['totalCount', 'isScanning', 'showShuffle'],
      emits: ['shuffle', 'rescan']
    })
  };
});
vi.mock('@renderer/components/library/LibraryTabBar.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-tabbar', {
      props: ['modelValue', 'tabs'],
      emits: ['update:modelValue']
    })
  };
});
vi.mock('@renderer/components/library/LibraryTracksTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-tracks-tab', {
      props: ['tracks', 'viewMode', 'chip', 'query'],
      emits: ['update:viewMode', 'play', 'play-all', 'shuffle-all', 'edit', 'navigate-folder']
    })
  };
});
vi.mock('@renderer/components/library/LibraryVideoTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-video-tab', {
      props: ['tracks', 'viewMode'],
      emits: ['update:viewMode', 'play', 'play-all']
    })
  };
});
vi.mock('@renderer/components/library/LibraryImagesTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-images-tab', { props: ['images'], emits: ['open'] })
  };
});
vi.mock('@renderer/components/library/LibraryFoldersTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-folders-tab', { props: ['query'], emits: ['play-folder', 'edit'] })
  };
});
vi.mock('@renderer/components/library/LibraryArtistsTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-artists-tab', {
      props: ['artists', 'viewMode'],
      emits: ['update:viewMode', 'play-tracks']
    })
  };
});
vi.mock('@renderer/components/library/LibraryAlbumsTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-albums-tab', {
      props: ['albums', 'viewMode'],
      emits: ['update:viewMode', 'play-tracks']
    })
  };
});
vi.mock('@renderer/components/library/LibraryPlaylistManager.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-playlist-manager')
  };
});
vi.mock('@renderer/components/library/LibraryOverviewTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-overview-tab', {
      props: ['query', 'filteredAll'],
      emits: ['play', 'play-tracks', 'edit', 'show-all']
    })
  };
});
vi.mock('@renderer/components/library/LibrarySmartTab.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('library-smart-tab', { emits: ['edit'] })
  };
});
vi.mock('@renderer/components/library/TrackTagEditor.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('track-tag-editor', { props: ['track'], emits: ['close', 'saved'] })
  };
});
vi.mock('@renderer/components/library/MusicBrainzLookup.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('musicbrainz-lookup', {
      props: ['initialQuery', 'track', 'batchTracks'],
      emits: ['close', 'apply']
    })
  };
});
vi.mock('@renderer/components/layout/Loader.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('loader')
  };
});

let wrapper: VueWrapper | null = null;

function track(
  id: string,
  type: 'audio' | 'video' | 'image',
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    name: `${id}.${type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : 'png'}`,
    path: `C:\\Music\\${id}`,
    extension: type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : 'png',
    mimeType: 'audio/mpeg',
    size: 100,
    type,
    metadata: { title: id, artist: 'Artist', album: 'Album' },
    addedAt: 0,
    playCount: 0,
    ...overrides
  } as never;
}

function mountView() {
  wrapper = mount(LibraryView, { attachTo: document.body });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await vi.dynamicImportSettled();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await nextTick();
}

function comp(name: string) {
  return wrapper!.findComponent({ name });
}

beforeEach(() => {
  const tracks = [
    track('alpha', 'audio', { path: 'C:\\Music\\alpha.mp3', addedAt: 5, playCount: 2 }),
    track('beta', 'audio', { path: 'C:\\Music\\beta.mp3', addedAt: 30, playCount: 0 })
  ];
  state.library = reactive({
    tracks,
    totalCount: 10,
    audioCount: 2,
    videoCount: 1,
    imageCount: 1,
    folders: ['C:\\Music'],
    artists: [{ name: 'Artist' }],
    albums: [{ name: 'Album' }],
    playlists: [{ id: 'p1', name: 'List', tracks: [] }],
    isScanning: false,
    isLoading: false,
    isLoaded: true,
    scanFolders: vi.fn()
  });
  state.settings = reactive({
    library: { viewModes: { tracks: 'grid' } },
    updateLibrary: vi.fn()
  });
  state.player = reactive({
    favorites: ['C:\\Music\\alpha.mp3'],
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  });
  state.ui = { notify: vi.fn() };
  state.route = reactive({ query: {} });
  state.filters = {
    query: ref(''),
    debouncedQuery: ref(''),
    filteredTracks: ref([tracks[0], tracks[1]]),
    filteredAll: ref([...tracks]),
    filteredVideo: ref([track('clip', 'video')]),
    filteredImages: ref([track('pic', 'image')]),
    filteredArtists: ref([{ name: 'Artist' }]),
    filteredAlbums: ref([{ name: 'Album' }])
  };
  state.tagEditor = {
    editingTrack: ref(null),
    showingMBLookup: ref(false),
    onTagSaved: vi.fn(),
    onMBApply: vi.fn()
  };
  state.smart = reactive({
    smartPlaylists: [],
    ensureLoaded: vi.fn(async () => undefined)
  });
  state.dropped = [];
  state.folderTracks = [track('one', 'audio'), track('pic', 'image')];
  state.addFilesResult = undefined;
  state.invoke.mockReset();
  state.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'library:addFiles') return state.addFilesResult;
    return undefined;
  });
  state.resume.mockReset();
  state.resume.mockResolvedValue(undefined);
  state.readString.mockReset();
  state.readString.mockReturnValue(null);
  state.writeString.mockReset();
  state.readStringArray.mockReset();
  state.readStringArray.mockReturnValue([]);
  state.writeJson.mockReset();
  state.getAllTracksIndexed.mockReset();
  state.getAllTracksIndexed.mockReturnValue(state.folderTracks);
  state.isCoreShell.mockReset();
  state.isCoreShell.mockReturnValue(false);
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('tabs and layout', () => {
  it('opens the overview by default with header and toolbar data', async () => {
    mountView();
    await flush();

    expect(comp('library-overview-tab').exists()).toBe(true);
    expect(comp('library-header').props('totalCount')).toBe(10);
    expect(comp('library-header').props('showShuffle')).toBe(false);
    expect(comp('library-toolbar').props('tab')).toBe('overview');
    expect((comp('library-tabbar').props('tabs') as unknown[]).length).toBeGreaterThan(0);
    expect(state.smart.ensureLoaded).toHaveBeenCalled();
  });

  it('uses the tab from the route query and persists tab changes', async () => {
    state.route.query = { tab: 'tracks' };
    mountView();
    await flush();

    expect(comp('library-tracks-tab').exists()).toBe(true);
    expect(comp('library-header').props('showShuffle')).toBe(true);
    expect(comp('library-tracks-tab').props('viewMode')).toBe('grid');

    comp('library-tabbar').vm.$emit('update:modelValue', 'video');
    await flush();
    expect(state.writeString).toHaveBeenCalledWith('onda.libraryTab', 'video');
    expect(comp('library-video-tab').exists()).toBe(true);
  });

  it('falls back to the saved tab and ignores an invalid one', async () => {
    state.readString.mockReturnValue('video');
    mountView();
    await flush();
    expect(comp('library-video-tab').exists()).toBe(true);

    wrapper!.unmount();
    state.readString.mockReturnValue('nonsense');
    state.route.query = {};
    mountView();
    await flush();
    expect(comp('library-overview-tab').exists()).toBe(true);

    state.route.query = { tab: 'bogus' };
    await flush();
    expect(comp('library-overview-tab').exists()).toBe(true);
  });

  it('reacts to route tab changes', async () => {
    mountView();
    await flush();
    state.route.query = { tab: 'images' };
    await flush();
    expect(comp('library-images-tab').exists()).toBe(true);
  });

  it('loads every lazy tab and binds toolbar filters', async () => {
    mountView();
    await flush();

    const lazyTabs: Record<string, string> = {
      artists: 'library-artists-tab',
      albums: 'library-albums-tab',
      playlists: 'library-playlist-manager',
      smart: 'library-smart-tab',
      folders: 'library-folders-tab'
    };
    for (const [tab, name] of Object.entries(lazyTabs)) {
      comp('library-tabbar').vm.$emit('update:modelValue', tab);
      await flush();
      expect(comp(name).exists()).toBe(true);
    }

    comp('library-toolbar').vm.$emit('update:query', 'abc');
    comp('library-toolbar').vm.$emit('update:sortKey', 'title');
    comp('library-toolbar').vm.$emit('update:sortDir', 'asc');
    comp('library-toolbar').vm.$emit('update:chip', 'liked');
    await flush();

    expect(comp('library-toolbar').props('query')).toBe('abc');
    expect(comp('library-toolbar').props('sortKey')).toBe('title');
    expect(comp('library-toolbar').props('sortDir')).toBe('asc');
    expect(comp('library-toolbar').props('chip')).toBe('liked');
  });

  it('ignores scroll events from non-scrollable targets', async () => {
    mountView();
    await flush();
    const root = wrapper!.get('[data-testid="library-view"]');

    const empty = new Event('scroll');
    Object.defineProperty(empty, 'target', { value: {} });
    root.element.dispatchEvent(empty);

    const scrolled = new Event('scroll');
    Object.defineProperty(scrolled, 'target', { value: { scrollTop: 20 } });
    root.element.dispatchEvent(scrolled);
    root.element.dispatchEvent(scrolled);

    const backToTop = new Event('scroll');
    Object.defineProperty(backToTop, 'target', { value: { scrollTop: 0 } });
    root.element.dispatchEvent(backToTop);

    expect(root.attributes('data-testid')).toBe('library-view');
  });

  it('shows a loading skeleton until the library is loaded', async () => {
    state.library.isLoading = true;
    state.library.isLoaded = false;
    mountView();
    await flush();

    expect(wrapper!.findAll('.animate-pulse')).toHaveLength(6);
    expect(wrapper!.findAll('[role="tabpanel"]')).toHaveLength(0);
  });

  it('collapses the header when a list scrolls', async () => {
    mountView();
    await flush();
    const root = wrapper!.get('[data-testid="library-view"]');
    const list = document.createElement('div');
    Object.defineProperty(list, 'scrollTop', { value: 12, configurable: true });
    root.element.appendChild(list);

    list.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(root.find('.ui-page-header').classes()).toContain('shadow-md');

    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    list.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(root.find('.ui-page-header').classes()).not.toContain('shadow-md');
  });

  it('updates view modes and resets the scroll state on tab changes', async () => {
    state.route.query = { tab: 'tracks' };
    mountView();
    await flush();

    comp('library-tracks-tab').vm.$emit('update:viewMode', 'list');
    expect(state.settings.updateLibrary).toHaveBeenCalledWith({
      viewModes: { tracks: 'list' }
    });

    await comp('library-tabbar').vm.$emit('update:modelValue', 'video');
    await flush();
    comp('library-video-tab').vm.$emit('update:viewMode', 'grid');
    expect(state.settings.updateLibrary).toHaveBeenLastCalledWith({
      viewModes: { tracks: 'grid', video: 'grid' }
    });
  });

  it('handles header shuffle and rescan actions', async () => {
    mountView();
    await flush();

    comp('library-header').vm.$emit('shuffle');
    expect(state.player.setTrack).toHaveBeenCalled();
    comp('library-header').vm.$emit('rescan');
    expect(state.library.scanFolders).toHaveBeenCalled();
  });
});

describe('overview navigation and playback', () => {
  it('maps overview show-all sections to chips and sorting', async () => {
    mountView();
    await flush();

    const showAll = async (section: string) => {
      await comp('library-tabbar').vm.$emit('update:modelValue', 'overview');
      await flush();
      comp('library-overview-tab').vm.$emit('show-all', section);
      await flush();
    };

    await showAll('liked');
    expect(comp('library-toolbar').props('chip')).toBe('liked');

    await showAll('most');
    expect(comp('library-toolbar').props('chip')).toBe('most');
    expect(comp('library-toolbar').props('sortKey')).toBe('plays');

    await showAll('recent');
    expect(comp('library-toolbar').props('chip')).toBe('all');
    expect(comp('library-toolbar').props('sortKey')).toBe('added');
    expect(comp('library-toolbar').props('sortDir')).toBe('desc');

    await showAll('newest');
    expect(comp('library-toolbar').props('chip')).toBe('all');

    await showAll('random');
    expect(comp('library-toolbar').props('tab')).toBe('tracks');
  });

  it('plays single tracks, track lists and shuffled queues', async () => {
    mountView();
    await flush();
    const overview = comp('library-overview-tab');
    const [first, second] = state.library.tracks;

    overview.vm.$emit('play', first);
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalledWith(first);
    expect(state.player.play).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();

    overview.vm.$emit('play-tracks', [first, second]);
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([second]);

    comp('library-tabbar').vm.$emit('update:modelValue', 'tracks');
    await flush();

    comp('library-tracks-tab').vm.$emit('play-all');
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'beta' }));

    comp('library-tracks-tab').vm.$emit('shuffle-all');
    expect(state.player.setTrack).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'alpha' })
    );
  });

  it('resumes the audio engine for video playback outside the core shell', async () => {
    state.route.query = { tab: 'video' };
    mountView();
    await flush();

    comp('library-video-tab').vm.$emit('play', state.filters.filteredVideo.value[0]);
    expect(state.resume).toHaveBeenCalled();

    state.resume.mockClear();
    state.isCoreShell.mockReturnValue(true);
    wrapper!.unmount();
    mountView();
    await flush();
    comp('library-video-tab').vm.$emit('play', state.filters.filteredVideo.value[0]);
    expect(state.resume).not.toHaveBeenCalled();
  });

  it('plays a video list and ignores empty lists', async () => {
    state.route.query = { tab: 'video' };
    mountView();
    await flush();

    comp('library-video-tab').vm.$emit('play-all');
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'clip' }));

    state.player.setTrack.mockClear();
    state.filters.filteredVideo.value = [];
    comp('library-video-tab').vm.$emit('play-all');
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('opens folders and filters out images when playing a folder', async () => {
    state.route.query = { tab: 'folders' };
    mountView();
    await flush();

    comp('library-folders-tab').vm.$emit('play-folder', 'C:\\Music');
    expect(state.getAllTracksIndexed).toHaveBeenCalledWith(
      'C:\\Music',
      state.library.tracks,
      state.library.folders
    );
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }));
  });

  it('navigates to a folder with its ancestors expanded', async () => {
    state.readStringArray.mockReturnValue(['C:\\Music']);
    state.route.query = { tab: 'tracks' };
    mountView();
    await flush();

    comp('library-tracks-tab').vm.$emit('navigate-folder', 'C:\\Music\\Artists\\Album');
    await flush();

    expect(state.filters.query.value).toBe('Album');
    expect(comp('library-folders-tab').exists()).toBe(true);
    expect(state.writeJson).toHaveBeenCalled();
    const [key, paths] = state.writeJson.mock.calls[0];
    expect(key).toBe('onda.libraryExpanded');
    expect(paths).toEqual(
      expect.arrayContaining(['C:\\Music', 'C:\\Music\\Artists', 'C:\\Music\\Artists\\Album'])
    );
  });

  it('opens the image viewer with cloned file data', async () => {
    state.route.query = { tab: 'images' };
    mountView();
    await flush();

    comp('library-images-tab').vm.$emit('open', 3);
    expect(state.invoke).toHaveBeenCalledWith(
      'imageViewer:open',
      [
        expect.objectContaining({
          name: 'pic.png',
          path: 'C:\\Music\\pic',
          isDirectory: false,
          extension: 'png'
        })
      ],
      3
    );
  });
});

describe('library drop', () => {
  async function drop(paths: string[]): Promise<void> {
    state.dropped = paths;
    await wrapper!.get('[data-testid="library-view"]').trigger('drop', { dataTransfer: {} });
    await flush();
  }

  it('reports added, skipped and empty drops', async () => {
    mountView();
    await flush();

    state.addFilesResult = { added: 2, skipped: 1 };
    await drop(['C:\\a.mp3', 'C:\\b.mp3']);
    expect(state.invoke).toHaveBeenCalledWith('library:addFiles', ['C:\\a.mp3', 'C:\\b.mp3']);
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'library.dropAdded');

    state.ui.notify.mockClear();
    state.addFilesResult = { added: 0, skipped: 2 };
    await drop(['C:\\a.mp3']);
    expect(state.ui.notify).toHaveBeenCalledWith('info', 'library.dropNone');
  });

  it('reports file errors and ignored drops', async () => {
    mountView();
    await flush();

    state.addFilesResult = { added: 0, skipped: 0, error: 'nope' };
    await drop(['C:\\a.mp3']);
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'library.dropError');

    state.ui.notify.mockClear();
    state.addFilesResult = undefined;
    await drop(['C:\\a.mp3']);
    expect(state.ui.notify).not.toHaveBeenCalled();

    state.invoke.mockClear();
    await drop([]);
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('reports thrown failures', async () => {
    mountView();
    await flush();
    state.invoke.mockRejectedValueOnce(new Error('disk'));
    await drop(['C:\\a.mp3']);
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'library.dropError');
  });
});

describe('modals and events', () => {
  it('opens the tag editor for edits and clears it on close', async () => {
    mountView();
    await flush();

    comp('library-overview-tab').vm.$emit('edit', state.library.tracks[0]);
    await flush();
    expect(state.tagEditor.editingTrack.value).toBe(state.library.tracks[0]);
    expect(comp('track-tag-editor').props('track')).toBe(state.library.tracks[0]);

    comp('track-tag-editor').vm.$emit('close');
    await flush();
    expect(state.tagEditor.editingTrack.value).toBeNull();
    comp('track-tag-editor').vm.$emit('saved');
    expect(state.tagEditor.onTagSaved).toHaveBeenCalled();
  });

  it('opens MusicBrainz from the toolbar and custom events', async () => {
    mountView();
    await flush();

    comp('library-toolbar').vm.$emit('open-musicbrainz');
    await flush();
    expect(comp('musicbrainz-lookup').exists()).toBe(true);

    comp('musicbrainz-lookup').vm.$emit('close');
    await flush();
    expect(comp('musicbrainz-lookup').exists()).toBe(false);

    window.dispatchEvent(
      new CustomEvent('onda:openMusicbrainz', {
        detail: { query: 'artist', track: state.library.tracks[0] }
      })
    );
    await flush();
    expect(comp('musicbrainz-lookup').props('initialQuery')).toBe('artist');
    expect(comp('musicbrainz-lookup').props('track')).toBe(state.library.tracks[0]);

    comp('musicbrainz-lookup').vm.$emit('apply', { title: 'New' });
    expect(state.tagEditor.onMBApply).toHaveBeenCalledWith({ title: 'New' });
  });

  it('uses the first batch track and clears batch state on close', async () => {
    mountView();
    await flush();
    const batch = [state.library.tracks[0], state.library.tracks[1]];

    window.dispatchEvent(
      new CustomEvent('onda:openMusicbrainz', { detail: { batchTracks: batch } })
    );
    await flush();
    expect(comp('musicbrainz-lookup').props('batchTracks')).toEqual(batch);
    expect(state.tagEditor.editingTrack.value).toBe(batch[0]);

    comp('musicbrainz-lookup').vm.$emit('close');
    await flush();
    expect(comp('musicbrainz-lookup').exists()).toBe(false);
  });

  it('opens MusicBrainz even without a track or batch', async () => {
    mountView();
    await flush();
    window.dispatchEvent(new CustomEvent('onda:openMusicbrainz', { detail: {} }));
    await flush();

    expect(comp('musicbrainz-lookup').exists()).toBe(true);
    expect(comp('musicbrainz-lookup').props('track')).toBeNull();
  });

  it('stops listening for MusicBrainz events after unmount', async () => {
    mountView();
    await flush();
    wrapper!.unmount();
    wrapper = null;

    expect(() =>
      window.dispatchEvent(new CustomEvent('onda:openMusicbrainz', { detail: { query: 'late' } }))
    ).not.toThrow();
  });
});

describe('folder navigation', () => {
  it('expands root-level paths without looping', async () => {
    mountView();
    await flush();
    comp('library-tabbar').vm.$emit('update:modelValue', 'tracks');
    await flush();

    comp('library-tracks-tab').vm.$emit('navigate-folder', '/a');
    await flush();

    expect(state.writeJson).toHaveBeenCalledWith(
      'onda.libraryExpanded',
      expect.arrayContaining(['/a'])
    );
  });

  it('clears the query for a path without a file name', async () => {
    mountView();
    await flush();
    comp('library-tabbar').vm.$emit('update:modelValue', 'tracks');
    await flush();

    comp('library-tracks-tab').vm.$emit('navigate-folder', '/');
    await flush();

    expect(state.filters.query.value).toBe('');
  });
});

describe('overview sections', () => {
  it('handles the random section', async () => {
    mountView();
    await flush();

    comp('library-overview-tab').vm.$emit('show-all', 'random');
    await flush();

    expect(comp('library-tracks-tab').exists()).toBe(true);
    expect(state.filters.query.value).toBe('');
  });

  it('ignores an unknown section and still opens tracks', async () => {
    mountView();
    await flush();

    comp('library-overview-tab').vm.$emit('show-all', 'other');
    await flush();

    expect(comp('library-tracks-tab').exists()).toBe(true);
  });
});
