import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import SourcesContent from '../SourcesContent.vue';
import type { SourceItem } from '@renderer/types/sources';

const PageStub = defineComponent({
  name: 'SourcePageView',
  props: [
    'item',
    'rows',
    'viewMode',
    'rowLoading',
    'rowClickable',
    'downloadable',
    'downloaded',
    'selectable',
    'selectedIds'
  ],
  emits: ['row-click', 'select', 'download', 'download-all'],
  template: '<div data-testid="page" />'
});
const BaseStub = (name: string, testId: string) =>
  defineComponent({
    name,
    props: [
      'items',
      'viewMode',
      'downloadable',
      'downloadedIds',
      'downloadingItem',
      'selectable',
      'selectedIds'
    ],
    emits: ['activate', 'preview', 'select', 'download'],
    template: `<div data-testid="${testId}" />`
  });
const CarouselStub = BaseStub('SourceCarousel', 'carousel');
const PlayerStub = BaseStub('SourcePlayerView', 'player');
const CompactStub = BaseStub('SourceCompact', 'compact');
const GridStub = BaseStub('SourceGrid', 'grid');
const LightboxStub = defineComponent({
  name: 'SourceLightbox',
  props: ['items', 'index', 'downloadable', 'downloadedIds', 'downloadingItem'],
  emits: ['update:index', 'close', 'download', 'play'],
  template: '<div data-testid="lightbox" />'
});
const LoaderStub = defineComponent({ name: 'Loader', template: '<div data-testid="loader" />' });
const EmptyStub = defineComponent({
  name: 'EmptyState',
  props: ['title', 'icon'],
  template: '<div data-testid="empty">{{ title }}</div>'
});

const page: SourceItem = { id: 'p', title: 'Series', type: 'video' };
const row: SourceItem = { id: 'r', title: 'Episode', type: 'video' };
const itemA: SourceItem = { id: 'a', title: 'A', type: 'video' };
const itemB: SourceItem = { id: 'b', title: 'B', type: 'video' };

let wrapper: VueWrapper | null = null;

function props(overrides: Record<string, unknown> = {}) {
  return {
    error: '',
    isAuthError: false,
    isPage: false,
    viewMode: 'cards',
    pageItem: undefined,
    rows: [],
    rowLoading: false,
    rowClickable: false,
    downloadable: false,
    items: [],
    displayItems: [],
    loading: false,
    filterText: '',
    hasMore: false,
    paginationMode: 'none',
    downloadingItem: null,
    downloadedIds: new Set<string>(),
    ...overrides
  };
}

function mountContent(overrides: Record<string, unknown> = {}) {
  wrapper = mount(SourcesContent, {
    props: props(overrides) as never,
    global: {
      stubs: {
        SourcePageView: PageStub,
        SourceCarousel: CarouselStub,
        SourcePlayerView: PlayerStub,
        SourceCompact: CompactStub,
        SourceGrid: GridStub,
        SourceLightbox: LightboxStub,
        Loader: LoaderStub,
        EmptyState: EmptyStub
      }
    }
  });
  return wrapper;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('error banner', () => {
  it('shows the error and forwards the auth shortcut', async () => {
    mountContent({ error: 'Unauthorized', isAuthError: true });

    expect(wrapper!.get('[role="alert"]').text()).toContain('Unauthorized');
    await wrapper!.get('[role="alert"] button').trigger('click');

    expect(wrapper!.emitted('editSource')).toHaveLength(1);
  });

  it('hides the shortcut for non-auth errors', () => {
    mountContent({ error: 'Network down' });

    expect(wrapper!.get('[role="alert"]').text()).toContain('Network down');
    expect(wrapper!.find('[role="alert"] button').exists()).toBe(false);
  });
});

describe('page mode', () => {
  it('renders the page view and forwards its events', async () => {
    mountContent({
      isPage: true,
      pageItem: page,
      rows: [row],
      downloadable: true,
      downloadedIds: new Set(['p'])
    });

    const view = wrapper!.findComponent(PageStub);
    expect(view.props()).toMatchObject({
      item: page,
      rows: [row],
      downloadable: true,
      downloaded: true
    });

    view.vm.$emit('row-click', row);
    view.vm.$emit('select', row, new Event('click'));
    view.vm.$emit('download', row);
    view.vm.$emit('download-all', [row]);

    expect(wrapper!.emitted('rowClick')).toEqual([[row]]);
    expect(wrapper!.emitted('select')![0][0]).toEqual(row);
    expect(wrapper!.emitted('download')).toEqual([[row]]);
    expect(wrapper!.emitted('downloadAll')).toEqual([[[row]]]);
  });
});

describe('view modes', () => {
  const views = {
    carousel: CarouselStub,
    player: PlayerStub,
    compact: CompactStub,
    cards: GridStub
  } as const;

  it.each(['carousel', 'player', 'compact', 'cards'] as const)(
    'renders %s content and opens the lightbox on activation',
    async (viewMode) => {
      mountContent({ viewMode, displayItems: [itemA] });

      wrapper!.findComponent(views[viewMode]).vm.$emit('activate', itemA);
      await wrapper!.vm.$nextTick();

      if (viewMode === 'cards') {
        expect(wrapper!.find('[data-testid="lightbox"]').exists()).toBe(true);
      } else {
        expect(wrapper!.emitted('preview')).toEqual([[itemA]]);
      }
    }
  );

  it('forwards select and download from child views', () => {
    mountContent({ viewMode: 'carousel', displayItems: [itemA] });
    const view = wrapper!.findComponent(CarouselStub);

    view.vm.$emit('select', itemA, new Event('click'));
    view.vm.$emit('download', itemA);

    expect(wrapper!.emitted('select')![0][0]).toEqual(itemA);
    expect(wrapper!.emitted('download')).toEqual([[itemA]]);
  });
});

describe('lightbox', () => {
  it('opens at the clicked index and updates or closes', async () => {
    mountContent({ viewMode: 'cards', displayItems: [itemA, itemB] });
    const grid = wrapper!.findComponent(GridStub);

    grid.vm.$emit('activate', itemB);
    await wrapper!.vm.$nextTick();

    const lightbox = wrapper!.findComponent(LightboxStub);
    expect(lightbox.props('index')).toBe(1);

    lightbox.vm.$emit('update:index', 0);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(LightboxStub).props('index')).toBe(0);

    lightbox.vm.$emit('download', itemB);
    lightbox.vm.$emit('play', itemB);
    expect(wrapper!.emitted('download')).toEqual([[itemB]]);
    expect(wrapper!.emitted('play')).toEqual([[itemB]]);

    wrapper!.findComponent(LightboxStub).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="lightbox"]').exists()).toBe(false);
  });

  it('ignores unknown items from the grid', async () => {
    mountContent({ viewMode: 'cards', displayItems: [itemA] });
    const grid = wrapper!.findComponent(GridStub);

    grid.vm.$emit('activate', { id: 'unknown' } as SourceItem);
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('[data-testid="lightbox"]').exists()).toBe(false);
  });
});

describe('loading and empty states', () => {
  it('shows the loader while loading', () => {
    mountContent({ loading: true });

    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('sources.refresh');
  });

  it('distinguishes filtered and empty results', () => {
    mountContent({ loading: false, filterText: 'missing' });
    expect(wrapper!.get('[data-testid="empty"]').text()).toBe('sources.noFilterResults');

    wrapper!.unmount();
    mountContent({ loading: false, filterText: '   ' });
    expect(wrapper!.get('[data-testid="empty"]').text()).toBe('sources.noItems');
  });
});

describe('pagination', () => {
  it('shows load more for non-page pagination and forwards clicks', async () => {
    mountContent({ items: [itemA], hasMore: true, paginationMode: 'scroll' });

    const more = wrapper!.findAll('button').find((button) => button.text() === 'sources.loadMore')!;
    expect(more.attributes('disabled')).toBeUndefined();
    await more.trigger('click');

    expect(wrapper!.emitted('fetchMore')).toHaveLength(1);
  });

  it('disables load more while loading', () => {
    mountContent({ items: [itemA], hasMore: true, paginationMode: 'scroll', loading: true });

    const more = wrapper!.findAll('button').find((button) => button.text() === 'sources.loadMore')!;
    expect(more.attributes('disabled')).toBeDefined();
  });

  it('hides load more for page pagination or without more items', () => {
    mountContent({ items: [itemA], hasMore: true, paginationMode: 'page' });
    expect(wrapper!.findAll('button').some((button) => button.text() === 'sources.loadMore')).toBe(
      false
    );

    wrapper!.unmount();
    mountContent({ items: [itemA], hasMore: false });
    expect(wrapper!.findAll('button').some((button) => button.text() === 'sources.loadMore')).toBe(
      false
    );
  });
});

describe('download and preview forwarding', () => {
  const viewStubs = [
    ['carousel', CarouselStub],
    ['player', PlayerStub],
    ['compact', CompactStub],
    ['cards', GridStub]
  ] as const;

  it.each(viewStubs)('forwards preview and download from %s', (viewMode, stub) => {
    mountContent({ viewMode, displayItems: [itemA] });
    const view = wrapper!.findComponent(stub);

    if (viewMode === 'cards') {
      view.vm.$emit('preview', itemA);
    } else {
      view.vm.$emit('activate', itemA);
    }
    view.vm.$emit('download', itemA);

    expect(wrapper!.emitted('preview')).toEqual([[itemA]]);
    expect(wrapper!.emitted('download')).toEqual([[itemA]]);
  });
});
