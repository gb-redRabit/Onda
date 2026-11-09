import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  list: null as any,
  options: null as any,
  playTrackList: vi.fn(),
  focus: vi.fn(),
  selectText: vi.fn()
}));

vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    state.options = options;
    return ref({
      getVirtualItems: () => state.list.items,
      getTotalSize: () => state.list.total,
      measureElement: vi.fn()
    });
  }
}));
vi.mock('@renderer/utils/playTracks', () => ({ playTrackList: state.playTrackList }));

const InputStub = defineComponent({
  name: 'InputStub',
  props: { modelValue: String, type: String, size: String, ariaLabel: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(_props, { expose }) {
    expose({ focus: state.focus, select: state.selectText });
    return () => null;
  }
});
const CoverStub = defineComponent({
  name: 'MediaCoverStub',
  props: { path: String, size: Number },
  template: '<span data-testid="cover" />'
});

import CompactTracks from '../CompactTracks.vue';

let wrapper: VueWrapper | null = null;

function track(
  name: string,
  meta: { title?: string; artist?: string; album?: string } = {},
  overrides: Record<string, unknown> = {}
) {
  return {
    id: name,
    name,
    path: `D:/music/${name}`,
    type: 'audio',
    duration: 125,
    metadata: meta,
    ...overrides
  } as never;
}

function setup() {
  wrapper = mount(CompactTracks, {
    global: {
      stubs: { Input: InputStub, MediaCover: CoverStub },
      directives: { activate: {} },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function rows() {
  return wrapper!
    .findAll('[data-testid^="compact-track-"]')
    .filter((row) => row.attributes('data-testid')?.match(/^compact-track-\d+$/));
}

beforeEach(() => {
  state.library = reactive({
    audioTracks: [
      track('b.mp3', { title: 'Beta', artist: 'Artist B' }),
      track('a.mp3', { title: 'Alpha' })
    ],
    isLoaded: true,
    loadError: null,
    search: vi.fn((q: string) =>
      (state.library.audioTracks as any[]).filter((item) => item.name.includes(q))
    ),
    loadFromDisk: vi.fn(async () => undefined)
  });
  state.player = reactive({ currentTrack: null as any, addToQueue: vi.fn() });
  state.list = { items: [], total: 0 };
  state.options = null;
  state.playTrackList.mockReset();
  state.focus.mockReset();
  state.selectText.mockReset();
  (window as unknown as { api?: unknown }).api = { invoke: vi.fn(async () => undefined) };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('loading and empty states', () => {
  it('shows a loading hint before the library is ready', () => {
    state.library.isLoaded = false;
    setup();
    expect(wrapper!.text()).toContain('compact.loading');
  });

  it('shows the empty library actions', async () => {
    state.library.audioTracks = [];
    setup();

    expect(wrapper!.text()).toContain('compact.emptyLibrary');
    expect(wrapper!.text()).toContain('compact.addLibraryHint');
    await wrapper!.get('[data-testid="compact-empty-open-full"]').trigger('click');
    expect((window as any).api.invoke).toHaveBeenCalledWith('app:setWindowMode', 'main');
  });

  it('shows no results for a query without matches', async () => {
    setup();
    const input = wrapper!.getComponent(InputStub);
    input.vm.$emit('update:modelValue', 'zzz');
    await wrapper!.vm.$nextTick();

    expect(wrapper!.text()).toContain('compact.noResults');
    expect(wrapper!.find('[data-testid="compact-empty-open-full"]').exists()).toBe(false);
  });

  it('shows and retries a library error', async () => {
    state.library.loadError = 'boom';
    setup();

    expect(wrapper!.get('[data-testid="compact-library-error"]').attributes('role')).toBe('alert');
    await wrapper!.get('[data-testid="compact-library-retry"]').trigger('click');

    expect(state.library.loadFromDisk).toHaveBeenCalledWith({ audioOnly: true });
  });
});

describe('track list', () => {
  beforeEach(() => {
    state.list = {
      items: [
        { index: 0, key: 'a', start: 0, size: 48 },
        { index: 1, key: 'b', start: 48, size: 48 }
      ],
      total: 96
    };
  });

  it('sorts audio tracks by title', () => {
    setup();
    const list = rows();

    expect(list).toHaveLength(2);
    expect(list[0].text()).toContain('Alpha');
    expect(list[1].text()).toContain('Beta');
    expect(list[1].text()).toContain('Artist B');
  });

  it('formats durations and marks the current track', () => {
    state.player.currentTrack = { path: 'D:/music/a.mp3' };
    setup();

    expect(rows()[0].text()).toContain('2:05');
    expect(rows()[0].find('[aria-label="compact.nowPlaying"]').exists()).toBe(true);
    expect(rows()[1].find('[aria-label="compact.nowPlaying"]').exists()).toBe(false);
  });

  it('plays and queues rows', async () => {
    setup();

    await wrapper!.get('[data-testid="compact-track-0"]').trigger('click');
    await wrapper!.get('[data-testid="compact-track-add-1"]').trigger('click');

    expect(state.playTrackList).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.mp3' })]);
    expect(state.player.addToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'b.mp3' })
    );
  });

  it('falls back to album and hides missing durations', () => {
    state.library.audioTracks = [
      track('x.mp3', { title: 'X', album: 'Album X' }, { duration: undefined }),
      track('y.mp3', {}, { duration: Infinity })
    ];
    state.list = { items: [{ index: 0, key: 'x', start: 0, size: 48 }], total: 48 };
    setup();

    const row = rows()[0];
    expect(row.text()).toContain('Album X');
    expect(row.text()).toContain('X');
    expect(row.text()).not.toContain('Infinity');
  });

  it('configures the virtualizer', () => {
    setup();
    expect(state.options.count()).toBe(2);
    expect(state.options.estimateSize()).toBe(48);
    expect(state.options.overscan).toBe(8);
    expect(state.options.scrollEl()).toBeTruthy();
  });
});

describe('search', () => {
  it('filters and sorts search results', async () => {
    state.list = {
      items: [{ index: 0, key: 'b', start: 0, size: 48 }],
      total: 48
    };
    setup();
    const input = wrapper!.getComponent(InputStub);
    input.vm.$emit('update:modelValue', 'b.mp3');
    await wrapper!.vm.$nextTick();

    expect(state.library.search).toHaveBeenCalledWith('b.mp3');
    expect(rows()[0].text()).toContain('Beta');
  });

  it('focuses and selects the search input', () => {
    setup();
    (wrapper!.vm as any).focusSearch();

    expect(state.focus).toHaveBeenCalledTimes(1);
    expect(state.selectText).toHaveBeenCalledTimes(1);
  });
});
