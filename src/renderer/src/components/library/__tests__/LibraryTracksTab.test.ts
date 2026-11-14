import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import LibraryTracksTab from '../LibraryTracksTab.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  selection: null as any,
  gridObserve: vi.fn(),
  gridDestroy: vi.fn(),
  measureElement: vi.fn(),
  listItems: [{ index: 0, key: 0, start: 0, size: 48 }] as any[],
  listTotal: 48,
  rowItems: [{ index: 0, key: 0, start: 0, size: 200 }] as any[],
  rowTotal: 200,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/library-selection', () => ({
  useLibrarySelectionStore: () => state.selection
}));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ trackCount: (count: number) => `count:${count}` })
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    if (options.estimateSize() === 48) {
      return {
        getVirtualItems: () => state.listItems,
        getTotalSize: () => {
          options.count();
          options.scrollEl();
          return state.listTotal;
        }
      };
    }
    return ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => {
        options.count();
        options.scrollEl();
        return state.rowTotal;
      },
      measureElement: (el: Element | null) => {
        if (el) {
          options.measureElement(el);
          return state.measureElement(el);
        }
        return 0;
      }
    });
  }
}));
vi.mock('@renderer/composables/useVirtualGrid', () => ({
  useVirtualGrid: () => ({
    cols: ref(6),
    observe: state.gridObserve,
    destroy: state.gridDestroy
  })
}));

const RowStub = defineComponent({
  props: ['track', 'showPlaylist', 'selected', 'query'],
  emits: ['play', 'edit', 'select'],
  template: '<div data-testid="track-row" />'
});
const CardStub = defineComponent({
  props: ['track', 'showPlaylist', 'selected'],
  emits: ['play', 'edit', 'select'],
  template: '<div data-testid="track-card" />'
});
const BulkBarStub = defineComponent({
  props: ['count', 'playlists'],
  emits: ['play', 'queue', 'add-to-playlist', 'clear'],
  template: '<div data-testid="bulk-bar" />'
});
const EmptyStub = defineComponent({
  props: ['liked'],
  template: '<div data-testid="tracks-empty" />'
});
const ViewTabsStub = { template: '<div data-testid="view-tabs" />' };

let wrapper: VueWrapper | null = null;

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `C:/music/${id}.mp3`,
    name: `${id}.mp3`,
    type: 'audio',
    duration: 10,
    ...overrides
  } as any;
}

function tracks(count: number) {
  return Array.from({ length: count }, (_, index) => track(`t${index}`));
}

function mountTab(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryTracksTab, {
    props: {
      tracks: tracks(3),
      viewMode: 'list',
      chip: 'all',
      query: '',
      ...props
    } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        LibraryTrackRow: RowStub,
        LibraryTrackCard: CardStub,
        LibraryTracksBulkBar: BulkBarStub,
        LibraryTracksEmpty: EmptyStub,
        LibraryViewTabs: ViewTabsStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.library = reactive({
    playlists: [{ id: 'p1', name: 'P' }],
    addToPlaylist: vi.fn()
  });
  state.player = {
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    addToQueue: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  };
  state.selection = reactive({
    count: 0,
    has: vi.fn((path: string) => path === 'C:/music/t1.mp3'),
    toggle: vi.fn(),
    selectRange: vi.fn(),
    clear: vi.fn()
  });
  state.gridObserve.mockReset();
  state.gridDestroy.mockReset();
  state.measureElement.mockReset();
  state.listItems = [{ index: 0, key: 0, start: 0, size: 48 }];
  state.listTotal = 48;
  state.rowItems = [{ index: 0, key: 0, start: 0, size: 200 }];
  state.rowTotal = 200;
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('empty state and header', () => {
  it('renders the empty state with the liked flag', () => {
    mountTab({ tracks: [], chip: 'liked' });
    expect(wrapper!.findComponent(EmptyStub).props('liked')).toBe(true);
    expect(wrapper!.find('[data-testid="track-row"]').exists()).toBe(false);
  });

  it('renders the count, view toggles and emits view mode changes', async () => {
    mountTab();
    expect(wrapper!.text()).toContain('count:3');

    await wrapper!.get('[data-testid="library-view-list"]').trigger('click');
    await wrapper!.get('[data-testid="library-view-grid"]').trigger('click');
    expect(wrapper!.emitted('update:viewMode')).toEqual([['list'], ['grid']]);
  });

  it('highlights the active view mode', () => {
    mountTab({ viewMode: 'grid' });
    expect(wrapper!.get('[data-testid="library-view-grid"]').classes()).toContain('bg-primary');
    expect(wrapper!.get('[data-testid="library-view-list"]').classes()).not.toContain('bg-primary');
  });

  it('emits play-all and shuffle-all', async () => {
    mountTab();
    await wrapper!.get('[data-testid="library-play-all"]').trigger('click');
    expect(wrapper!.emitted('playAll')).toHaveLength(1);

    await wrapper!.get('button[title="library.shuffle"]').trigger('click');
    expect(wrapper!.emitted('shuffleAll')).toHaveLength(1);
  });
});

describe('list mode', () => {
  it('passes virtual rows, selection and query to rows', () => {
    state.listItems = [
      { index: 0, key: 0, start: 0, size: 48 },
      { index: 1, key: 1, start: 48, size: 48 }
    ];
    mountTab();
    const rows = wrapper!.findAllComponents(RowStub);
    expect(rows).toHaveLength(2);
    expect(rows[0].props()).toMatchObject({ showPlaylist: true, selected: false, query: '' });
    expect(rows[1].props('selected')).toBe(true);
    expect(rows[0].props('track')).toMatchObject({ id: 't0' });
  });

  it('forwards play and edit from rows', () => {
    mountTab();
    const item = track('x');
    wrapper!.findComponent(RowStub).vm.$emit('play', item);
    wrapper!.findComponent(RowStub).vm.$emit('edit', item);
    expect(wrapper!.emitted('play')?.[0]).toEqual([item]);
    expect(wrapper!.emitted('edit')?.[0]).toEqual([item]);
  });

  it('toggles selection for plain and additive clicks', () => {
    mountTab();
    wrapper!.findComponent(RowStub).vm.$emit('select', new MouseEvent('click'), true);
    expect(state.selection.toggle).toHaveBeenCalledWith('C:/music/t0.mp3');
    expect(state.selection.selectRange).not.toHaveBeenCalled();

    wrapper!
      .findComponent(RowStub)
      .vm.$emit('select', new MouseEvent('click', { shiftKey: true }), false);
    expect(state.selection.selectRange).toHaveBeenCalledWith(expect.any(Array), 'C:/music/t0.mp3');
  });

  it('clears selection when the track list changes', async () => {
    mountTab();
    await wrapper!.setProps({ tracks: tracks(4) });
    expect(state.selection.clear).toHaveBeenCalled();
  });
});

describe('grid mode', () => {
  it('slices visible rows into cards', () => {
    state.rowItems = [
      { index: 0, key: 0, start: 0, size: 200 },
      { index: 1, key: 1, start: 200, size: 200 }
    ];
    mountTab({ viewMode: 'grid', tracks: tracks(8) });

    const cards = wrapper!.findAllComponents(CardStub);
    expect(cards).toHaveLength(8);
    expect(cards[0].props()).toMatchObject({ showPlaylist: true, selected: false });
    expect(cards[1].props('selected')).toBe(true);

    const rows = wrapper!.findAll('[data-index]');
    expect(rows).toHaveLength(2);
    expect(rows[1].attributes('style')).toContain('translateY(200px)');
  });

  it('caps the last row to the remaining tracks', () => {
    state.rowItems = [{ index: 1, key: 1, start: 200, size: 200 }];
    mountTab({ viewMode: 'grid', tracks: tracks(8) });
    expect(wrapper!.findAllComponents(CardStub)).toHaveLength(2);
  });

  it('forwards card events and maps the card index to the track index', () => {
    state.rowItems = [{ index: 1, key: 1, start: 200, size: 200 }];
    mountTab({ viewMode: 'grid', tracks: tracks(8) });
    const cards = wrapper!.findAllComponents(CardStub);
    cards[1].vm.$emit('select', new MouseEvent('click'), false);
    expect(state.selection.toggle).toHaveBeenCalledWith('C:/music/t7.mp3');

    const item = track('y');
    cards[0].vm.$emit('play', item);
    cards[0].vm.$emit('edit', item);
    expect(wrapper!.emitted('play')?.[0]).toEqual([item]);
    expect(wrapper!.emitted('edit')?.[0]).toEqual([item]);
  });

  it('measures rendered grid rows', () => {
    mountTab({ viewMode: 'grid' });
    expect(state.measureElement).toHaveBeenCalledWith(expect.any(HTMLElement));
  });
});

describe('bulk actions', () => {
  function showBulk() {
    state.selection.count = 3;
    mountTab();
    return wrapper!.findComponent(BulkBarStub);
  }

  it('renders the bar only when something is selected', async () => {
    mountTab();
    expect(wrapper!.findComponent(BulkBarStub).exists()).toBe(false);

    state.selection.count = 1;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(BulkBarStub).props()).toMatchObject({
      count: 1,
      playlists: state.library.playlists
    });
  });

  it('plays selected tracks and clears the selection', () => {
    state.selection.has.mockImplementation((path: string) => path !== 'C:/music/t0.mp3');
    const bar = showBulk();
    bar.vm.$emit('play');
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 't2' })
    ]);
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(state.player.play).toHaveBeenCalled();
    expect(state.selection.clear).toHaveBeenCalled();
  });

  it('plays a single selected track without queueing extras', () => {
    state.selection.count = 1;
    mountTab();
    wrapper!.findComponent(BulkBarStub).vm.$emit('play');
    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalled();
  });

  it('does nothing when no track matches the selection', () => {
    state.selection.count = 2;
    state.selection.has.mockReturnValue(false);
    mountTab();
    wrapper!.findComponent(BulkBarStub).vm.$emit('play');
    expect(state.player.clearQueue).not.toHaveBeenCalled();
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('queues selected tracks and clears the selection', () => {
    const bar = showBulk();
    bar.vm.$emit('queue');
    expect(state.player.addToQueue).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(state.selection.clear).toHaveBeenCalled();
  });

  it('adds selected tracks to a playlist and clears the selection', () => {
    const bar = showBulk();
    bar.vm.$emit('add-to-playlist', 'p1');
    expect(state.library.addToPlaylist).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ id: 't1' })
    );
    expect(state.selection.clear).toHaveBeenCalled();
  });

  it('clears the selection from the bar', () => {
    const bar = showBulk();
    bar.vm.$emit('clear');
    expect(state.selection.clear).toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('observes the grid and handles Escape', async () => {
    state.selection.count = 2;
    mountTab();
    expect(state.gridObserve).toHaveBeenCalled();

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(state.selection.clear).toHaveBeenCalled();

    state.selection.count = 0;
    const other = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('destroys the grid and removes listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    mountTab();
    wrapper!.unmount();
    wrapper = null;
    expect(state.gridDestroy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
