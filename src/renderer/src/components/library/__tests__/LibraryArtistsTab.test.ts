import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import LibraryArtistsTab from '../LibraryArtistsTab.vue';

const state = vi.hoisted(() => ({
  cols: null as any,
  observe: vi.fn(),
  destroy: vi.fn(),
  listItems: [] as any[],
  listTotal: 100,
  rowItems: [] as any[],
  rowTotal: 200,
  trackCount: vi.fn((count: number) => `tracks:${count}`),
  groupLabel: vi.fn((name: string, t: any) => {
    void t;
    return `label:${name}`;
  }),
  t: vi.fn((key: string) => key),
  listOptions: null as any,
  rowOptions: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
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

let wrapper: VueWrapper | null = null;

function track(name: string) {
  return { name, path: `C:/music/${name}.mp3` } as any;
}

function artist(name: string, count: number): [string, any[]] {
  return [name, Array.from({ length: count }, (_, index) => track(`${name}${index}`))];
}

const artists = [artist('Beta', 2), artist('Alpha', 3)];

function mountTab(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryArtistsTab, {
    props: { artists, viewMode: 'list', ...props } as never,
    global: { mocks: { $t: (key: string) => key } }
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
  state.rowTotal = 180;
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
    mountTab({ artists: [] });
    expect(wrapper!.text()).toContain('library.noArtists');
    expect(wrapper!.findAll('button')).toHaveLength(0);
  });

  it('renders the count and sort options', () => {
    mountTab();
    expect(wrapper!.text()).toContain('2 library.artistsCount');
    const select = wrapper!.get('select');
    const options = select.findAll('option');
    expect(options.map((o) => o.text())).toEqual([
      'library.sortArtist A→Z',
      'library.sortAlbumsByCount'
    ]);
    expect((select.element as HTMLSelectElement).value).toBe('name');
  });

  it('toggles view mode buttons and highlights the active mode', async () => {
    mountTab({ viewMode: 'grid' });
    const buttons = viewButtons();
    expect(buttons).toHaveLength(2);
    expect(buttons[0].classes()).not.toContain('bg-primary');
    expect(buttons[1].classes()).toContain('bg-primary');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(wrapper!.emitted('update:viewMode')).toEqual([['list'], ['grid']]);
  });
});

describe('sorting', () => {
  it('sorts artists by name by default', () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    expect(wrapper!.text()).toContain('label:Alpha');
    expect(wrapper!.text().indexOf('Alpha')).toBeLessThan(wrapper!.text().indexOf('Beta'));
  });

  it('sorts by track count when selected', async () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    await wrapper!.get('select').setValue('count');
    expect(wrapper!.text().indexOf('Alpha')).toBeLessThan(wrapper!.text().indexOf('Beta'));
    expect(state.trackCount).toHaveBeenCalledWith(2);
    expect(state.trackCount).toHaveBeenCalledWith(3);
  });
});

describe('list mode', () => {
  it('renders virtual rows and plays on click', async () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 56 },
      { index: 1, key: 1, start: 56, size: 56 }
    ];
    mountTab();
    const rows = wrapper!.findAll('div[style*="translateY"]');
    expect(rows).toHaveLength(2);
    expect(rows[1].attributes('style')).toContain('translateY(56px)');
    expect(wrapper!.text()).toContain('label:Alpha');
    expect(wrapper!.text()).toContain('tracks:3');

    await rows[0].find('div').trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]?.[0]).toHaveLength(3);
    expect(state.groupLabel).toHaveBeenCalledWith('Alpha', state.t);
  });

  it('renders the virtual height and options', () => {
    mountTab();
    expect(wrapper!.html()).toContain('height: 56px');
    expect(state.listOptions.count()).toBe(2);
    expect(state.listOptions.overscan).toBe(10);
    expect(state.listOptions.estimateSize()).toBe(56);
  });
});

describe('grid mode', () => {
  it('slices virtual rows into artist buttons', async () => {
    state.rowItems = [
      { index: 0, start: 0 },
      { index: 1, start: 180 }
    ];
    state.cols.value = 1;
    state.rowTotal = 360;
    mountTab({ viewMode: 'grid' });

    const buttons = wrapper!.findAll('button').filter((b) => !b.attributes('title'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toContain('label:Alpha');
    expect(buttons[1].text()).toContain('label:Beta');

    const rows = wrapper!.findAll('div[style*="position: absolute"]');
    expect(rows).toHaveLength(2);
    expect(rows[1].attributes('style')).toContain('top: 180px');

    await buttons[1].trigger('click');
    expect(wrapper!.emitted('playTracks')?.[0]?.[0]).toHaveLength(2);
  });

  it('slices multiple artists per row', () => {
    state.cols.value = 2;
    state.rowItems = [{ index: 0, start: 0 }];
    mountTab({ viewMode: 'grid' });
    const buttons = wrapper!.findAll('button').filter((b) => !b.attributes('title'));
    expect(buttons).toHaveLength(2);
    expect(wrapper!.html()).toContain('display: flex');
  });

  it('caps the final row to the remaining artists', () => {
    state.cols.value = 2;
    state.rowItems = [{ index: 1, start: 180 }];
    mountTab({ viewMode: 'grid' });
    const buttons = wrapper!.findAll('button').filter((b) => !b.attributes('title'));
    expect(buttons).toHaveLength(0);
  });

  it('configures the grid virtualizer', () => {
    state.cols.value = 2;
    mountTab({ viewMode: 'grid' });
    expect(state.rowOptions.count()).toBe(1);
    expect(state.rowOptions.overscan).toBe(3);
    expect(state.rowOptions.estimateSize()).toBe(180);
    expect(wrapper!.html()).toContain('height: 180px');
  });
});

describe('lifecycle', () => {
  it('observes the grid on mount and destroys it on unmount', () => {
    mountTab();
    expect(state.observe).toHaveBeenCalled();
    wrapper!.unmount();
    wrapper = null;
    expect(state.destroy).toHaveBeenCalled();
  });
});
