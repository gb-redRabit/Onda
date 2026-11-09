import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  yt: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));

const GridStub = defineComponent({
  name: 'OnlineMediaGridStub',
  props: { items: Array, colWidth: Number, minCols: Number, estimateRowHeight: Number },
  template: `<div data-testid="grid" :data-cols="colWidth" :data-min="minCols" :data-row="estimateRowHeight">
    <slot name="header" />
    <div v-for="item in items" :key="item.id"><slot :item="item" /></div>
    <slot name="footer" />
  </div>`
});
const HeaderStub = defineComponent({
  name: 'OnlineSourceHeaderStub',
  props: {
    kind: String,
    title: String,
    channelTitle: String,
    totalItems: Number,
    loadedCount: Number,
    loading: Boolean,
    canDownloadAll: Boolean,
    canPlayAll: Boolean,
    canSave: Boolean,
    saved: Boolean,
    saving: Boolean
  },
  emits: ['download-all', 'play-all', 'save', 'clear'],
  template: `<div data-testid="source-header" :data-can-save="String(canSave)">
    <button data-testid="header-download" @click="$emit('download-all')" />
    <button data-testid="header-play" @click="$emit('play-all')" />
    <button data-testid="header-save" @click="$emit('save')" />
    <button data-testid="header-clear" @click="$emit('clear')" />
  </div>`
});
const CardStub = defineComponent({
  name: 'OnlineMediaCardStub',
  props: {
    video: Object,
    expanded: Boolean,
    selectable: Boolean,
    selected: Boolean,
    state: String,
    coverStatus: String,
    watchUrl: String
  },
  emits: [
    'expand',
    'collapse',
    'toggle-select',
    'queue',
    'play',
    'options',
    'open-window',
    'open-channel'
  ],
  template: `<div data-testid="card" :data-state="state" :data-cover="coverStatus" :data-url="watchUrl" :data-expanded="String(expanded)" :data-selected="String(selected)" :data-selectable="String(selectable)">
    <button data-testid="card-expand" @click="$emit('expand', video)" />
    <button data-testid="card-collapse" @click="$emit('collapse')" />
    <button data-testid="card-select" @click="$emit('toggle-select', 'sel')" />
    <button data-testid="card-queue" @click="$emit('queue', video)" />
    <button data-testid="card-play" @click="$emit('play', video)" />
    <button data-testid="card-options" @click="$emit('options', video)" />
    <button data-testid="card-window" @click="$emit('open-window', 'window-url')" />
    <button data-testid="card-channel" @click="$emit('open-channel', 'channel-url')" />
  </div>`
});
const ToolbarStub = defineComponent({
  name: 'OnlineSelectionToolbarStub',
  props: { selectedCount: Number, totalCount: Number, rangeStart: Number, rangeEnd: Number },
  emits: ['update:rangeStart', 'update:rangeEnd', 'select-all', 'select-range', 'add-selected'],
  template: `<div data-testid="selection-toolbar">
    <button data-testid="toolbar-all" @click="$emit('select-all')" />
    <button data-testid="toolbar-range" @click="$emit('select-range')" />
    <button data-testid="toolbar-add" @click="$emit('add-selected')" />
    <button data-testid="toolbar-start" @click="$emit('update:rangeStart', 5)" />
    <button data-testid="toolbar-end" @click="$emit('update:rangeEnd', 9)" />
  </div>`
});
const ButtonStub = defineComponent({
  name: 'OnlineButtonStub',
  props: { variant: String, size: String, disabled: Boolean },
  template: '<button :disabled="disabled"><slot /></button>'
});

import OnlineResolvedPanel from '../OnlineResolvedPanel.vue';

let wrapper: VueWrapper | null = null;

function item(id: string) {
  return { id, title: id, channelId: 'UC', url: `https://y/${id}` } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineResolvedPanel, {
    props: {
      resolvedLoading: false,
      resolvedCapped: false,
      selectedCount: 0,
      saved: false,
      saving: false,
      expandedId: null,
      rangeStart: 1,
      rangeEnd: 100,
      ...props
    },
    global: {
      stubs: {
        OnlineMediaGrid: GridStub,
        OnlineSourceHeader: HeaderStub,
        OnlineMediaCard: CardStub,
        OnlineSelectionToolbar: ToolbarStub,
        OnlineButton: ButtonStub
      },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function cards() {
  return wrapper!.findAll('[data-testid="card"]');
}

function setupWithModels() {
  const expanded = ref<string | null>(null);
  const rangeStart = ref(1);
  const rangeEnd = ref(100);
  const Harness = defineComponent({
    setup() {
      return () =>
        h(OnlineResolvedPanel, {
          resolvedLoading: false,
          resolvedCapped: false,
          selectedCount: 0,
          saved: false,
          saving: false,
          expandedId: expanded.value,
          rangeStart: rangeStart.value,
          rangeEnd: rangeEnd.value,
          'onUpdate:expandedId': (value: string | null) => {
            expanded.value = value;
          },
          'onUpdate:rangeStart': (value: number) => {
            rangeStart.value = value;
          },
          'onUpdate:rangeEnd': (value: number) => {
            rangeEnd.value = value;
          }
        });
    }
  });
  wrapper = mount(Harness, {
    global: {
      stubs: {
        OnlineMediaGrid: GridStub,
        OnlineSourceHeader: HeaderStub,
        OnlineMediaCard: CardStub,
        OnlineSelectionToolbar: ToolbarStub,
        OnlineButton: ButtonStub
      },
      mocks: { $t: (key: string) => key }
    }
  });
  return { expanded, rangeStart, rangeEnd };
}

beforeEach(() => {
  state.t.mockClear();
  state.yt = {
    resolved: {
      kind: 'playlist',
      title: 'My playlist',
      sourceUrl: 'https://y/playlist',
      items: [item('a'), item('b')],
      meta: { channelTitle: 'Channel', totalItems: 2 }
    },
    selectedResolved: new Set<string>(),
    itemUrl: vi.fn((video: { id: string }) => `https://watch/${video.id}`),
    isQueuing: vi.fn(() => false),
    downloadStatusFor: vi.fn(() => null),
    coverStatusFor: vi.fn(() => null),
    playStream: vi.fn()
  };
});

describe('visibility and layout', () => {
  it('renders nothing without a resolved result', () => {
    state.yt.resolved = null;
    setup();
    expect(wrapper!.find('[data-testid="grid"]').exists()).toBe(false);
  });

  it('uses video layout for single videos', () => {
    state.yt.resolved = { ...state.yt.resolved, kind: 'video', items: [item('v')] };
    setup();

    const grid = wrapper!.get('[data-testid="grid"]');
    expect(grid.attributes('data-cols')).toBe('1200');
    expect(grid.attributes('data-min')).toBe('1');
    expect(grid.attributes('data-row')).toBe('220');
    expect(wrapper!.get('[data-testid="source-header"]').attributes('data-can-save')).toBe('false');
    expect(wrapper!.find('[data-testid="selection-toolbar"]').exists()).toBe(false);
  });

  it('uses grid layout for playlists', () => {
    setup();
    const grid = wrapper!.get('[data-testid="grid"]');
    expect(grid.attributes('data-cols')).toBe('300');
    expect(grid.attributes('data-min')).toBe('2');
    expect(grid.attributes('data-row')).toBe('300');
    expect(wrapper!.get('[data-testid="source-header"]').attributes('data-can-save')).toBe('true');
    expect(wrapper!.find('[data-testid="selection-toolbar"]').exists()).toBe(true);
  });

  it('passes header metadata and forwards header actions', async () => {
    setup({ resolvedLoading: true, saved: true, saving: true });
    const header = wrapper!.getComponent(HeaderStub);
    expect(header.props()).toMatchObject({
      kind: 'playlist',
      title: 'My playlist',
      channelTitle: 'Channel',
      totalItems: 2,
      loadedCount: 2,
      loading: true,
      saved: true,
      saving: true
    });

    await wrapper!.get('[data-testid="header-download"]').trigger('click');
    await wrapper!.get('[data-testid="header-play"]').trigger('click');
    await wrapper!.get('[data-testid="header-save"]').trigger('click');
    await wrapper!.get('[data-testid="header-clear"]').trigger('click');

    expect(wrapper!.emitted('downloadAll')).toHaveLength(1);
    expect(wrapper!.emitted('playAll')).toHaveLength(1);
    expect(wrapper!.emitted('save')).toHaveLength(1);
    expect(wrapper!.emitted('clear')).toHaveLength(1);
  });
});

describe('cards', () => {
  it('maps item state and selection', () => {
    state.yt.selectedResolved = new Set(['b']);
    state.yt.isQueuing.mockImplementation((id: string) => id === 'a');
    state.yt.downloadStatusFor.mockImplementation((id: string) =>
      id === 'b' ? 'downloading' : null
    );
    state.yt.coverStatusFor.mockImplementation((id: string) => (id === 'b' ? 'saved' : null));
    setup();

    const cardsEl = cards();
    expect(cardsEl[0].attributes('data-state')).toBe('queuing');
    expect(cardsEl[0].attributes('data-url')).toBe('https://watch/a');
    expect(cardsEl[1].attributes('data-state')).toBe('downloading');
    expect(cardsEl[1].attributes('data-cover')).toBe('saved');
    expect(cardsEl[1].attributes('data-selected')).toBe('true');
    expect(cardsEl[0].attributes('data-selectable')).toBe('true');
  });

  it('maps completed downloads and covers still fetching', () => {
    state.yt.downloadStatusFor.mockImplementation((id: string) =>
      id === 'a' ? 'completed' : 'pending'
    );
    state.yt.coverStatusFor.mockImplementation((id: string) => (id === 'a' ? 'fetching' : null));
    setup();

    expect(cards()[0].attributes('data-state')).toBe('downloading');
  });

  it('maps a completed download to done', () => {
    state.yt.downloadStatusFor.mockReturnValue('completed');
    state.yt.coverStatusFor.mockReturnValue('saved');
    setup();

    expect(cards()[0].attributes('data-state')).toBe('done');
    expect(cards()[1].attributes('data-state')).toBe('done');
  });

  it('treats paused as downloading', () => {
    state.yt.downloadStatusFor.mockReturnValue('paused');
    setup();
    expect(cards()[0].attributes('data-state')).toBe('downloading');
  });

  it('marks expansion and collapses through the model', async () => {
    const models = setupWithModels();
    expect(cards()[0].attributes('data-expanded')).toBe('false');

    await wrapper!.get('[data-testid="card-expand"]').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(models.expanded.value).toBe('a');
    expect(cards()[0].attributes('data-expanded')).toBe('true');

    await wrapper!.get('[data-testid="card-collapse"]').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(models.expanded.value).toBeNull();
    expect(cards()[0].attributes('data-expanded')).toBe('false');
  });

  it('forwards card events', async () => {
    setup();
    await wrapper!.get('[data-testid="card-select"]').trigger('click');
    await wrapper!.get('[data-testid="card-queue"]').trigger('click');
    await wrapper!.get('[data-testid="card-play"]').trigger('click');
    await wrapper!.get('[data-testid="card-options"]').trigger('click');
    await wrapper!.get('[data-testid="card-window"]').trigger('click');
    await wrapper!.get('[data-testid="card-channel"]').trigger('click');

    expect(wrapper!.emitted('toggleSelect')).toEqual([['sel']]);
    expect(wrapper!.emitted('quickQueue')).toHaveLength(1);
    expect(state.yt.playStream).toHaveBeenCalledTimes(1);
    expect(wrapper!.emitted('options')).toHaveLength(1);
    expect(wrapper!.emitted('openWindow')).toEqual([['https://watch/a']]);
    expect(wrapper!.emitted('openChannel')).toEqual([['channel-url']]);
  });
});

describe('footer', () => {
  it('shows an empty count when there are no items', () => {
    state.yt.resolved = { ...state.yt.resolved, items: [] };
    setup();

    expect(wrapper!.text()).toContain('youtube.itemsCount:{"count":0}');
    expect(wrapper!.find('[data-testid="selection-toolbar"]').exists()).toBe(false);
  });

  it('offers load-more when capped', async () => {
    setup({ resolvedCapped: true });
    const button = wrapper!.get('.py-4 button');

    await button.trigger('click');
    expect(wrapper!.emitted('loadMore')).toHaveLength(1);
  });

  it('disables load-more while loading', () => {
    setup({ resolvedCapped: true, resolvedLoading: true });
    const button = wrapper!.get('.py-4 button');

    expect(button.attributes('disabled')).toBeDefined();
    expect(wrapper!.find('.animate-spin').exists()).toBe(true);
  });

  it('hides load-more when not capped', () => {
    setup();
    expect(wrapper!.find('.animate-spin').exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('youtube.loadMore');
  });

  it('forwards selection toolbar actions and range updates', async () => {
    setup({ selectedCount: 2 });
    const toolbar = wrapper!.getComponent(ToolbarStub);
    expect(toolbar.props()).toMatchObject({
      selectedCount: 2,
      totalCount: 2,
      rangeStart: 1,
      rangeEnd: 100
    });

    await wrapper!.get('[data-testid="toolbar-all"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-range"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-add"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-start"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-end"]').trigger('click');

    expect(wrapper!.emitted('selectAll')).toHaveLength(1);
    expect(wrapper!.emitted('selectRange')).toHaveLength(1);
    expect(wrapper!.emitted('addSelected')).toHaveLength(1);
  });

  it('updates the selection range models', async () => {
    const models = setupWithModels();

    await wrapper!.get('[data-testid="toolbar-start"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-end"]').trigger('click');

    expect(models.rangeStart.value).toBe(5);
    expect(models.rangeEnd.value).toBe(9);
  });
});
