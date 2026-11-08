import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import LibraryAlbumsTab from '../LibraryAlbumsTab.vue';

const state = vi.hoisted(() => ({
  cols: null as any,
  observe: vi.fn(),
  destroy: vi.fn(),
  listItems: [] as any[],
  listTotal: 56,
  rowItems: [] as any[],
  rowTotal: 256,
  trackCount: vi.fn((count: number) => `tracks:${count}`),
  groupLabel: vi.fn((name: string, t: any) => {
    void t;
    return `label:${name}`;
  }),
  t: vi.fn((key: string) => key),
  listOptions: null as any,
  rowOptions: null as any
}));

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: state.t })
}));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ trackCount: state.trackCount })
}));
vi.mock('@renderer/utils/libraryLabels', () => ({ groupLabel: state.groupLabel }));
vi.mock('@renderer/composables/useVirtualGrid', () => ({
  useVirtualGrid: () => ({
    cols: state.cols,
    observe: state.observe,
    destroy: state.destroy
  })
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    if (options.estimateSize() === 56) {
      state.listOptions = options;
      return {
        getVirtualItems: () => state.listItems,
        getTotalSize: () => state.listTotal
      };
    }
    state.rowOptions = options;
    return ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => state.rowTotal
    });
  }
}));

const AlbumCardStub = defineComponent({
  props: ['name', 'tracks'],
  emits: ['play'],
  template: '<button data-testid="album-card" @click="$emit(\'play\', tracks)" />'
});
const CoverStub = defineComponent({
  props: {
    path: String,
    size: Number,
    renderAsVideo: Boolean,
    still: Boolean,
    fallback: String
  },
  template: '<div data-testid="cover" />'
});

let wrapper: VueWrapper | null = null;

function track(name: string, year?: number, artist?: string) {
  return {
    name,
    path: `C:/music/${name}.mp3`,
    metadata: { year, artist }
  } as any;
}

function album(name: string, tracks: any[]): [string, any[]] {
  return [name, tracks];
}

const albums = [
  album('Beta', [track('b1', 2001, 'Beta Artist'), track('b2', 2001, 'Beta Artist')]),
  album('Alpha', [track('a1', 2020, 'Alpha Artist')])
];

function mountTab(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryAlbumsTab, {
    props: { albums, viewMode: 'list', ...props } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { AlbumCard: AlbumCardStub, MediaCover: CoverStub }
    }
  });
  return wrapper;
}

function viewButtons() {
  return wrapper!
    .findAll('button')
    .filter((b) =>
      ['library.viewModeList', 'library.viewModeGrid'].includes(b.attributes('title') || '')
    );
}

beforeEach(() => {
  state.cols = ref(5);
  state.observe.mockReset();
  state.destroy.mockReset();
  state.listItems = [{ index: 0, key: 0, start: 0, size: 56 }];
  state.listTotal = 56;
  state.rowItems = [{ index: 0, start: 0 }];
  state.rowTotal = 256;
  state.trackCount.mockClear();
  state.groupLabel.mockClear();
  state.t.mockClear();
  state.listOptions = null;
  state.rowOptions = null;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('empty and header', () => {
  it('renders the empty state', () => {
    mountTab({ albums: [] });
    expect(wrapper!.text()).toContain('library.noAlbums');
  });

  it('renders the count and three sort options', () => {
    mountTab();
    expect(wrapper!.text()).toContain('2 library.albumsCount');
    const options = wrapper!.get('select').findAll('option');
    expect(options.map((o) => o.text())).toEqual([
      'library.sortAlbumsByName',
      'library.sortAlbumsByCount',
      'library.sortAlbumsByYear'
    ]);
  });

  it('toggles view mode with active styling', async () => {
    mountTab({ viewMode: 'grid' });
    const buttons = viewButtons();
    expect(buttons[1].classes()).toContain('bg-primary');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(wrapper!.emitted('update:viewMode')).toEqual([['list'], ['grid']]);
  });
});

describe('sorting', () => {
  it('sorts by name by default', () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    expect(wrapper!.text().indexOf('label:Alpha')).toBeLessThan(
      wrapper!.text().indexOf('label:Beta')
    );
  });

  it('sorts by track count descending', async () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    await wrapper!.get('select').setValue('count');
    expect(wrapper!.text().indexOf('label:Beta')).toBeLessThan(
      wrapper!.text().indexOf('label:Alpha')
    );
    expect(state.trackCount).toHaveBeenCalledWith(2);
  });

  it('sorts by year descending', async () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    await wrapper!.get('select').setValue('year');
    expect(wrapper!.text().indexOf('label:Alpha')).toBeLessThan(
      wrapper!.text().indexOf('label:Beta')
    );
  });

  it('treats missing years as zero', async () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    wrapper = mount(LibraryAlbumsTab, {
      props: {
        albums: [album('Old', [track('x1')]), album('New', [track('n1', 2024)])],
        viewMode: 'list'
      } as never,
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { AlbumCard: AlbumCardStub, MediaCover: CoverStub }
      }
    });
    await wrapper!.get('select').setValue('year');
    expect(wrapper!.text().indexOf('label:New')).toBeLessThan(wrapper!.text().indexOf('label:Old'));
  });
});

describe('list mode', () => {
  it('renders rows with cover, labels, artist and count', () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    const rows = wrapper!.findAll('div[style*="translateY"]');
    expect(rows).toHaveLength(2);
    expect(rows[1].attributes('style')).toContain('translateY(56px)');
    expect(wrapper!.text()).toContain('label:Alpha');
    expect(wrapper!.text()).toContain('Alpha Artist');
    expect(wrapper!.text()).toContain('tracks:1');
    expect(wrapper!.findAll('[data-testid="cover"]')).toHaveLength(2);

    const cover = wrapper!.findComponent(CoverStub);
    expect(cover.props()).toMatchObject({
      path: 'C:/music/a1.mp3',
      size: 16,
      renderAsVideo: false,
      still: true,
      fallback: 'disc'
    });
  });

  it('plays album tracks on row click', async () => {
    mountTab();
    await wrapper!.findAll('div[style*="translateY"]')[0].find('div').trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]?.[0]).toHaveLength(1);
    expect(state.groupLabel).toHaveBeenCalledWith('Alpha', expect.any(Function));
  });

  it('falls back to the unknown artist label', () => {
    wrapper = mount(LibraryAlbumsTab, {
      props: {
        albums: [album('NoArtist', [track('x', 2000)])],
        viewMode: 'list'
      } as never,
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { AlbumCard: AlbumCardStub, MediaCover: CoverStub }
      }
    });
    expect(wrapper!.text()).toContain('common.unknown');
  });

  it('configures the list virtualizer', () => {
    mountTab();
    expect(state.listOptions.count()).toBe(2);
    expect(state.listOptions.overscan).toBe(10);
    expect(state.listOptions.estimateSize()).toBe(56);
    expect(wrapper!.html()).toContain('height: 56px');
  });
});

describe('grid mode', () => {
  it('renders album cards per row and forwards play', async () => {
    state.cols.value = 1;
    state.rowItems = [
      { index: 0, start: 0 },
      { index: 1, start: 256 }
    ];
    mountTab({ viewMode: 'grid' });

    const cards = wrapper!.findAllComponents(AlbumCardStub);
    expect(cards).toHaveLength(2);
    expect(cards[0].props()).toMatchObject({ name: 'Alpha' });
    expect(cards[1].props()).toMatchObject({ name: 'Beta' });

    const rows = wrapper!.findAll('div[style*="position: absolute"]');
    expect(rows).toHaveLength(2);
    expect(rows[1].attributes('style')).toContain('top: 256px');

    await cards[1].trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]?.[0]).toHaveLength(2);
  });

  it('renders two albums per row', () => {
    state.cols.value = 2;
    state.rowItems = [{ index: 0, start: 0 }];
    mountTab({ viewMode: 'grid' });
    expect(wrapper!.findAllComponents(AlbumCardStub)).toHaveLength(2);
    expect(wrapper!.html()).toContain('display: flex');
  });

  it('caps the final row', () => {
    state.cols.value = 2;
    state.rowItems = [{ index: 1, start: 256 }];
    mountTab({ viewMode: 'grid' });
    expect(wrapper!.findAllComponents(AlbumCardStub)).toHaveLength(0);
  });

  it('configures the row virtualizer', () => {
    state.cols.value = 2;
    mountTab({ viewMode: 'grid' });
    expect(state.rowOptions.count()).toBe(1);
    expect(state.rowOptions.overscan).toBe(3);
    expect(state.rowOptions.estimateSize()).toBe(256);
  });
});

describe('lifecycle', () => {
  it('observes and destroys the grid', () => {
    mountTab();
    expect(state.observe).toHaveBeenCalled();
    wrapper!.unmount();
    wrapper = null;
    expect(state.destroy).toHaveBeenCalled();
  });
});
