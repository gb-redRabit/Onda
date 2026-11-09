import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  grid: null as any,
  detail: null as any,
  options: [] as any[],
  playTrackList: vi.fn(),
  groupLabel: vi.fn((label: string) => `label:${label}`)
}));

vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    state.options.push(options);
    const target = state.options.length === 1 ? state.grid : state.detail;
    return ref({
      getVirtualItems: () => target.items,
      getTotalSize: () => target.total,
      measureElement: target.measure
    });
  }
}));
vi.mock('@renderer/utils/playTracks', () => ({ playTrackList: state.playTrackList }));
vi.mock('@renderer/utils/libraryLabels', () => ({ groupLabel: state.groupLabel }));

const MediaCoverStub = defineComponent({
  name: 'MediaCoverStub',
  props: { path: String, size: Number, fallback: String },
  template: '<div data-testid="cover" />'
});

import CompactAlbums from '../CompactAlbums.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(CompactAlbums, {
    global: {
      stubs: { MediaCover: MediaCoverStub },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function track(name: string, meta: { title?: string; artist?: string; albumArtist?: string } = {}) {
  return {
    id: name,
    name,
    path: `D:/music/${name}.mp3`,
    metadata: meta
  } as never;
}

function rows() {
  return state.grid.items as Array<{ index: number; key: string; start: number }>;
}

function albumButton(index: number) {
  return wrapper!.get(`[data-testid="compact-album-${index}"]`);
}

beforeEach(() => {
  state.library = reactive({ albums: [] });
  state.player = { addToQueue: vi.fn() };
  state.options = [];
  state.grid = { items: [], total: 0, measure: vi.fn() };
  state.detail = { items: [], total: 0, measure: vi.fn() };
  state.playTrackList.mockReset();
  state.groupLabel.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('empty state', () => {
  it('shows a hint without albums', () => {
    setup();
    expect(wrapper!.text()).toContain('compact.emptyAlbums');
    expect(wrapper!.find('[data-testid="compact-album-0"]').exists()).toBe(false);
  });
});

describe('album grid', () => {
  beforeEach(() => {
    state.library.albums = [
      ['First', [track('a', { artist: 'Artist A' }), track('b')]],
      ['Second', [track('c', { albumArtist: 'Album Artist' })]],
      ['Third', []]
    ];
    rows().push({ index: 0, key: '0', start: 0 });
    rows().push({ index: 1, key: '1', start: 236 });
    state.grid.total = 472;
  });

  it('renders two-column rows from the virtualizer', () => {
    setup();

    expect(wrapper!.findAll('[data-testid^="compact-album-"]')).toHaveLength(3);
    expect(wrapper!.get('[data-index="0"]').attributes('style')).toContain('translateY(0px)');
    expect(wrapper!.get('[data-index="1"]').attributes('style')).toContain('translateY(236px)');
    expect(wrapper!.get('.relative').attributes('style')).toContain('height: 472px');
  });

  it('labels albums and shows artist metadata', () => {
    setup();

    expect(state.groupLabel).toHaveBeenCalledWith('First', expect.any(Function));
    expect(state.groupLabel).toHaveBeenCalledWith('Second', expect.any(Function));
    expect(state.groupLabel).toHaveBeenCalledWith('Third', expect.any(Function));
    expect(albumButton(0).text()).toContain('label:First');
    expect(albumButton(0).text()).toContain('Artist A');
    expect(albumButton(1).text()).toContain('Album Artist');
    expect(albumButton(2).text()).toContain('—');
  });

  it('gives the cover the first track path', () => {
    setup();
    const covers = wrapper!.findAllComponents(MediaCoverStub);

    expect(covers[0].props()).toMatchObject({
      path: 'D:/music/a.mp3',
      size: 160,
      fallback: 'disc'
    });
    expect(covers[2].props('path')).toBeUndefined();
  });

  it('measures rows through the virtualizer', () => {
    setup();
    const measure = state.grid.measure;
    const element = wrapper!.get('[data-index="0"]').element as HTMLElement;

    // The template binds the ref callback on each rendered row.
    expect(measure).toHaveBeenCalledWith(element);
  });

  it('configures both virtualizers', async () => {
    setup();
    const grid = state.options[0];

    expect(grid.count()).toBe(2);
    expect(grid.estimateSize()).toBe(236);
    expect(grid.overscan).toBe(3);
    expect(grid.measureElement(wrapper!.get('[data-index="0"]').element)).toBe(0);
    expect(grid.scrollEl()).toBeTruthy();

    await albumButton(0).trigger('click');
    const detail = state.options[1];
    expect(detail.count()).toBe(2);
    expect(detail.estimateSize()).toBe(32);
    expect(detail.overscan).toBe(6);
    expect(detail.scrollEl()).toBeTruthy();
  });
});

describe('album detail', () => {
  beforeEach(() => {
    state.library.albums = [
      ['First', [track('a', { title: 'Song A', artist: 'Artist A' }), track('b')]],
      ['Second', [track('c')]]
    ];
    rows().push({ index: 0, key: '0', start: 0 });
    state.grid.total = 236;
  });

  async function open() {
    setup();
    await albumButton(0).trigger('click');
  }

  it('opens the selected album', async () => {
    await open();

    expect(wrapper!.find('[data-testid="compact-album-detail"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('label:First');
    expect(wrapper!.text()).toContain('Artist A');
    expect(wrapper!.find('[data-testid="compact-album-back"]').exists()).toBe(true);
  });

  it('plays the whole album and queues every track', async () => {
    await open();

    await wrapper!.get('[data-testid="compact-play-album"]').trigger('click');
    expect(state.playTrackList).toHaveBeenCalledWith(state.library.albums[0][1]);

    await wrapper!.get('[data-testid="compact-add-album-queue"]').trigger('click');
    expect(state.player.addToQueue.mock.calls.map(([t]: any[]) => t.name)).toEqual(['a', 'b']);
  });

  it('goes back to the grid', async () => {
    await open();
    await wrapper!.get('[data-testid="compact-album-back"]').trigger('click');

    expect(wrapper!.find('[data-testid="compact-album-detail"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="compact-album-0"]').exists()).toBe(true);
  });

  it('renders virtual track rows with titles and numbers', async () => {
    state.detail.items = [
      { index: 0, key: '0', start: 0 },
      { index: 1, key: '1', start: 32 }
    ];
    state.detail.total = 64;
    await open();

    expect(wrapper!.get('[data-testid="compact-album-track-0"]').text()).toContain('Song A');
    expect(wrapper!.get('[data-testid="compact-album-track-1"]').text()).toContain('b');
    expect(wrapper!.get('[data-index="1"]').attributes('style')).toContain('translateY(32px)');
    expect(wrapper!.get('.relative').attributes('style')).toContain('height: 64px');
  });

  it('plays from a track and queues single rows', async () => {
    state.detail.items = [
      { index: 0, key: '0', start: 0 },
      { index: 1, key: '1', start: 32 }
    ];
    await open();

    await wrapper!.get('[data-testid="compact-album-track-1"]').trigger('click');
    expect(state.playTrackList).toHaveBeenCalledWith(state.library.albums[0][1].slice(1));

    await wrapper!.get('[data-testid="compact-album-track-add-1"]').trigger('click');
    expect(state.player.addToQueue).toHaveBeenCalledWith(state.library.albums[0][1][1]);
  });

  it('keeps the selection bound by key after the library changes', async () => {
    await open();

    const replacement = [track('a2', { title: 'Replacement', artist: 'Artist A' })];
    state.library.albums = [['First', replacement]];
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('[data-testid="compact-album-detail"]').exists()).toBe(true);
    await wrapper!.get('[data-testid="compact-play-album"]').trigger('click');
    expect(state.playTrackList).toHaveBeenLastCalledWith(replacement);
  });

  it('closes when the selected album disappears', async () => {
    await open();

    state.library.albums = [['Second', [track('c')]]];
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('[data-testid="compact-album-detail"]').exists()).toBe(false);
  });
});
