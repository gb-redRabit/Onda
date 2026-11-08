import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import WebcastView from '../WebcastView.vue';

const state = vi.hoisted(() => ({
  saved: null as any,
  yt: null as any,
  radio: null as any,
  cols: null as any,
  rowItems: [] as any[],
  rowTotal: 0,
  observe: vi.fn(),
  destroy: vi.fn(),
  readString: vi.fn(),
  writeString: vi.fn(),
  toItem: vi.fn((item: any) => ({ resolved: item.id })),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: state.t })
}));
vi.mock('@renderer/stores/saved', () => ({ useSavedStore: () => state.saved }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));
vi.mock('@renderer/stores/radio', () => ({ useRadioStore: () => state.radio }));
vi.mock('@renderer/utils/savedItem', () => ({ toResolvedItem: state.toItem }));
vi.mock('@renderer/utils/localStore', () => ({
  readString: state.readString,
  writeString: state.writeString
}));
vi.mock('@renderer/composables/useVirtualGrid', () => ({
  useVirtualGrid: () => ({
    cols: state.cols,
    observe: state.observe,
    destroy: state.destroy
  })
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: () =>
    ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => state.rowTotal
    })
}));

const HeaderStub = defineComponent({
  props: ['title', 'icon', 'sticky'],
  template: '<header><slot /></header>'
});
const RadioTabStub = defineComponent({
  emits: ['add'],
  template: '<div data-testid="radio-tab" />'
});
const PlaylistsStub = { template: '<div data-testid="saved-playlists" />' };
const AddDialogStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div data-testid="add-dialog" />'
});
const EmptyStub = defineComponent({
  props: { title: String, icon: Object, compact: Boolean },
  template: '<div data-testid="empty-state" />'
});

let wrapper: VueWrapper | null = null;

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Track ${id}`,
    channelTitle: `Channel ${id}`,
    duration: '3:20',
    thumbnail: `thumb-${id}.jpg`,
    ...overrides
  } as any;
}

function mountView() {
  wrapper = mount(WebcastView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        PageHeader: HeaderStub,
        WebcastRadioTab: RadioTabStub,
        WebcastSavedPlaylists: PlaylistsStub,
        RadioAddDialog: AddDialogStub,
        EmptyState: EmptyStub
      }
    }
  });
  return wrapper;
}

function tabs() {
  return wrapper!.findAll('[role="tab"]');
}

function tabKey(index: number, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
  tabs()[index].element.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  state.saved = reactive({
    tracks: [track('a'), track('b'), track('c')],
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    removeTrack: vi.fn().mockResolvedValue(undefined)
  });
  state.yt = reactive({
    playStream: vi.fn().mockResolvedValue(undefined),
    queueSavedTrack: vi.fn()
  });
  state.radio = reactive({ ensureLoaded: vi.fn().mockResolvedValue(undefined) });
  state.cols = ref(4);
  state.rowItems = [{ index: 0, start: 0 }];
  state.rowTotal = 220;
  state.observe.mockReset();
  state.destroy.mockReset();
  state.readString.mockReset();
  state.readString.mockReturnValue(null);
  state.writeString.mockReset();
  state.toItem.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {};
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('tab selection', () => {
  it('defaults to saved and ignores invalid stored values', () => {
    mountView();
    expect(state.readString).toHaveBeenCalledWith('onda.webcastTab');
    expect(tabs()[1].attributes('aria-selected')).toBe('true');
    expect(wrapper!.find('[data-testid="saved-playlists"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="radio-tab"]').exists()).toBe(false);
  });

  it('restores a stored radio preference', () => {
    state.readString.mockReturnValue('radio');
    mountView();
    expect(tabs()[0].attributes('aria-selected')).toBe('true');
    expect(wrapper!.find('[data-testid="radio-tab"]').exists()).toBe(true);
  });

  it('selects tabs on click and persists the choice', async () => {
    mountView();
    await tabs()[0].trigger('click');
    expect(state.writeString).toHaveBeenCalledWith('onda.webcastTab', 'radio');
    expect(tabs()[0].attributes('aria-selected')).toBe('true');
    expect(tabs()[0].attributes('tabindex')).toBe('0');
    expect(tabs()[1].attributes('tabindex')).toBe('-1');
    expect(wrapper!.find('[data-testid="radio-tab"]').exists()).toBe(true);

    await tabs()[1].trigger('click');
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'saved');
    expect(wrapper!.find('[data-testid="saved-playlists"]').exists()).toBe(true);
  });
});

describe('keyboard navigation', () => {
  it('moves right/down with wrap-around', async () => {
    mountView();
    const right = tabKey(0, 'ArrowRight');
    expect(right.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'saved');
    expect(document.activeElement).toBe(tabs()[1].element);

    tabKey(1, 'ArrowDown');
    await wrapper!.vm.$nextTick();
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'radio');
    expect(document.activeElement).toBe(tabs()[0].element);
  });

  it('moves left/up with wrap-around', async () => {
    mountView();
    const left = tabKey(0, 'ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'saved');

    tabKey(1, 'ArrowUp');
    await wrapper!.vm.$nextTick();
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'radio');
  });

  it('jumps to the first and last tab with Home/End', async () => {
    state.readString.mockReturnValue('saved');
    mountView();
    const home = tabKey(1, 'Home');
    expect(home.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'radio');

    const end = tabKey(0, 'End');
    expect(end.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    expect(state.writeString).toHaveBeenLastCalledWith('onda.webcastTab', 'saved');
  });

  it('ignores unrelated keys', () => {
    mountView();
    const event = tabKey(0, 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(state.writeString).not.toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('loads stores and observes the grid on the saved tab', () => {
    mountView();
    expect(state.saved.ensureLoaded).toHaveBeenCalled();
    expect(state.radio.ensureLoaded).toHaveBeenCalled();
    expect(state.observe).toHaveBeenCalledTimes(1);
  });

  it('does not observe on the radio tab', () => {
    state.readString.mockReturnValue('radio');
    mountView();
    expect(state.observe).not.toHaveBeenCalled();
  });

  it('observes or destroys the grid when the tab changes', async () => {
    state.readString.mockReturnValue('radio');
    mountView();
    await tabs()[1].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(state.observe).toHaveBeenCalled();
    expect(state.destroy).not.toHaveBeenCalled();

    await tabs()[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(state.destroy).toHaveBeenCalled();
  });

  it('destroys the grid on unmount', () => {
    mountView();
    wrapper!.unmount();
    wrapper = null;
    expect(state.destroy).toHaveBeenCalled();
  });
});

describe('saved tracks', () => {
  it('shows the empty state without tracks', () => {
    state.saved.tracks = [];
    mountView();
    expect(wrapper!.findComponent(EmptyStub).props()).toMatchObject({
      title: 'saved.emptyTracks',
      compact: true
    });
    expect(wrapper!.text()).toContain('(0)');
  });

  it('renders virtual rows with cards and metadata', () => {
    mountView();
    expect(wrapper!.text()).toContain('(3)');
    expect(wrapper!.findAll('[role="tab"]')).toHaveLength(2);
    expect(wrapper!.text()).toContain('Track a');
    expect(wrapper!.text()).toContain('Channel a');
    expect(wrapper!.text()).toContain('3:20');
    expect(wrapper!.findAll('img')).toHaveLength(3);

    const rows = wrapper!.findAll('.absolute.top-0.left-0.grid');
    expect(rows).toHaveLength(1);
    expect(rows[0].attributes('style')).toContain('translateY(0px)');
    expect(rows[0].attributes('style')).toContain('repeat(4, minmax(0, 1fr))');
  });

  it('slices cards per virtual row and skips thumbnails when absent', async () => {
    state.saved.tracks = [
      track('a', { thumbnail: '', duration: '' }),
      track('b', { thumbnail: '', duration: '' })
    ];
    mountView();
    expect(wrapper!.findAll('img')).toHaveLength(0);
    expect(wrapper!.text()).not.toContain('3:20');
  });

  it('handles empty virtual rows', () => {
    state.rowItems = [];
    mountView();
    expect(wrapper!.findAll('img')).toHaveLength(0);
    expect(wrapper!.text()).toContain('saved.tracksTitle');
  });

  it('plays, queues and removes tracks', async () => {
    mountView();
    const play = wrapper!.findAll('button[title="youtube.playStream"]')[0];
    await play.trigger('click');
    expect(state.toItem).toHaveBeenCalledWith(state.saved.tracks[0]);
    expect(state.yt.playStream).toHaveBeenCalledWith({ resolved: 'a' });

    await wrapper!.findAll('button[title="saved.addToQueue"]')[1].trigger('click');
    expect(state.yt.queueSavedTrack).toHaveBeenCalledWith(state.saved.tracks[1]);

    await wrapper!.findAll('button[title="common.delete"]')[2].trigger('click');
    expect(state.saved.removeTrack).toHaveBeenCalledWith('c');
  });
});

describe('radio tab', () => {
  it('opens the add dialog from the radio tab', async () => {
    state.readString.mockReturnValue('radio');
    mountView();
    expect(wrapper!.findComponent(AddDialogStub).props('modelValue')).toBe(false);

    wrapper!.findComponent(RadioTabStub).vm.$emit('add');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(AddDialogStub).props('modelValue')).toBe(true);

    wrapper!.findComponent(AddDialogStub).vm.$emit('update:modelValue', false);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(AddDialogStub).props('modelValue')).toBe(false);
  });

  it('keeps the add dialog mounted on the saved tab', () => {
    mountView();
    expect(wrapper!.find('[data-testid="add-dialog"]').exists()).toBe(true);
  });
});
