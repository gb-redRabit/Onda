import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  yt: null as any,
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  isScItem: vi.fn((..._args: any[]) => false)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.yt }));
vi.mock('@renderer/utils/onlineView', () => ({ isScItem: h.isScItem }));

const LoaderStub = defineComponent({
  name: 'Loader',
  props: ['overlay', 'label', 'size'],
  template: '<div data-testid="loader" />'
});
const EmptyStub = defineComponent({
  name: 'EmptyState',
  props: ['variant', 'icon', 'title', 'description'],
  template: '<div data-testid="empty">{{ title }}|{{ description }}</div>'
});
const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: ['variant', 'size', 'disabled', 'ariaLabel', 'title'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});
const CardStub = defineComponent({
  name: 'OnlineMediaCard',
  props: {
    video: Object,
    expanded: Boolean,
    state: String,
    coverStatus: String,
    watchUrl: String,
    platformTag: String,
    showChannel: Boolean,
    showViews: Boolean,
    showDescription: Boolean
  },
  emits: ['expand', 'collapse', 'queue', 'play', 'options', 'openWindow', 'openChannel'],
  template: '<div data-testid="media-card" />'
});

import OnlineSearchResultsPanel from '../OnlineSearchResultsPanel.vue';

let wrapper: VueWrapper | null = null;

function video(id: string) {
  return { id, title: `Video ${id}`, url: `https://youtube.com/watch?v=${id}` };
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineSearchResultsPanel, {
    props: {
      expandedId: null,
      'onUpdate:expandedId': vi.fn(),
      ...props
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        Loader: LoaderStub,
        EmptyState: EmptyStub,
        OnlineButton: ButtonStub,
        OnlineMediaCard: CardStub
      }
    }
  });
  return wrapper;
}

function cards() {
  return wrapper!.findAllComponents(CardStub);
}

function buttons() {
  return wrapper!.findAllComponents(ButtonStub);
}

beforeEach(() => {
  h.t.mockClear();
  h.isScItem.mockReset();
  h.isScItem.mockReturnValue(false);
  h.yt = reactive({
    isSearching: false,
    searchResults: [],
    resolved: null,
    searchQuery: '',
    pagedResults: [],
    hasPrevPage: false,
    hasNextPage: false,
    searchPage: 0,
    hasMoreSc: false,
    searchLoadingMore: false,
    clearSearch: vi.fn(),
    prevSearchPage: vi.fn(),
    nextSearchPage: vi.fn(),
    loadMoreSearch: vi.fn(),
    playStream: vi.fn(),
    itemUrl: vi.fn((item: { id: string }) => `url:${item.id}`),
    isQueuing: vi.fn(() => false),
    downloadStatusFor: vi.fn(() => 'pending'),
    coverStatusFor: vi.fn(() => null)
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('states', () => {
  it('shows the loader while searching', () => {
    h.yt.isSearching = true;
    setup();
    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(true);
  });

  it('shows the empty discover state', () => {
    setup();
    expect(wrapper!.get('[data-testid="empty"]').text()).toContain(
      'youtube.searchHeadingOnline|youtube.discover'
    );
  });

  it('hides the empty state when a link is resolved', () => {
    h.yt.resolved = { kind: 'video' };
    setup();
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(false);
  });
});

describe('results', () => {
  beforeEach(() => {
    h.yt.searchResults = [video('a'), video('b')];
    h.yt.pagedResults = [video('a'), video('b')];
    h.yt.searchQuery = '  lofi  ';
  });

  it('renders the count, query and clear action', async () => {
    setup();

    expect(wrapper!.text()).toContain('youtube.resultsLabel: 2');
    expect(wrapper!.text()).toContain('youtube.resultsFor:{"query":"lofi"}');

    await wrapper!.get('[data-testid="online-clear-results"]').trigger('click');
    expect(h.yt.clearSearch).toHaveBeenCalled();
  });

  it('skips the query suffix for an empty search', async () => {
    h.yt.searchQuery = '';
    setup();
    expect(wrapper!.text()).not.toContain('youtube.resultsFor');
  });

  it('passes card props and download states', () => {
    h.yt.isQueuing.mockImplementation((id: string) => id === 'a');
    h.yt.downloadStatusFor.mockImplementation((id: string) =>
      id === 'b' ? 'downloading' : 'idle'
    );
    setup();

    const [first, second] = cards();
    expect(first.props()).toMatchObject({
      expanded: false,
      state: 'queuing',
      watchUrl: 'url:a',
      platformTag: 'YT',
      showChannel: true,
      showViews: true,
      showDescription: true
    });
    expect(second.props('state')).toBe('downloading');
  });

  it('maps every download state', () => {
    h.yt.isQueuing.mockReturnValue(false);
    h.yt.downloadStatusFor.mockImplementation((id: string) => {
      if (id === 'a') return 'pending';
      if (id === 'b') return 'completed';
      return 'error';
    });
    setup();
    const [first, second] = cards();
    expect(first.props('state')).toBe('downloading');
    expect(second.props('state')).toBe('done');
  });

  it('marks completed items as downloading while the cover is fetched', () => {
    h.yt.downloadStatusFor.mockReturnValue('completed');
    h.yt.coverStatusFor.mockReturnValue('fetching');
    setup();
    expect(cards()[0].props('state')).toBe('downloading');
  });

  it('returns null for idle items', () => {
    h.yt.downloadStatusFor.mockReturnValue('error');
    setup();
    expect(cards()[0].props('state')).toBeNull();
  });

  it('tags SoundCloud results', () => {
    h.isScItem.mockImplementation((item: { id: string }) => item.id === 'b');
    setup();

    expect(cards()[0].props('platformTag')).toBe('YT');
    expect(cards()[1].props('platformTag')).toBe('SC');
    expect(h.isScItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'url:a');
  });

  it('forwards card events', async () => {
    setup();
    const card = cards()[0];

    card.vm.$emit('expand', video('a'));
    card.vm.$emit('collapse');
    card.vm.$emit('queue', video('a'));
    card.vm.$emit('play', video('a'));
    card.vm.$emit('options', video('a'));
    card.vm.$emit('openWindow', 'url:a');
    card.vm.$emit('openChannel', 'channel:a');
    await wrapper!.vm.$nextTick();

    expect(wrapper!.emitted('update:expandedId')).toEqual([['a'], [null]]);
    expect(wrapper!.emitted('quickQueue')).toHaveLength(1);
    expect(h.yt.playStream).toHaveBeenCalledWith(video('a'));
    expect(wrapper!.emitted('options')).toHaveLength(1);
    expect(wrapper!.emitted('openWindow')).toEqual([['url:a']]);
    expect(wrapper!.emitted('openChannel')).toEqual([['channel:a']]);
  });

  it('renders pagination for multiple pages and navigates', async () => {
    h.yt.searchResults = Array.from({ length: 45 }, (_, i) => video(String(i)));
    h.yt.pagedResults = [video('0')];
    h.yt.searchPage = 1;
    h.yt.hasPrevPage = true;
    h.yt.hasNextPage = true;
    setup();

    expect(wrapper!.text()).toContain('youtube.pageOf:{"current":2,"total":3}');
    const [prev, next] = buttons();
    expect(prev.props('ariaLabel')).toBe('common.previous');
    expect(next.props('ariaLabel')).toBe('common.next');

    await prev.trigger('click');
    await next.trigger('click');
    expect(h.yt.prevSearchPage).toHaveBeenCalled();
    expect(h.yt.nextSearchPage).toHaveBeenCalled();
  });

  it('disables paging at the edges and omits the control for one page', async () => {
    h.yt.searchResults = Array.from({ length: 21 }, (_, i) => video(String(i)));
    h.yt.pagedResults = [video('0')];
    h.yt.hasPrevPage = false;
    h.yt.hasNextPage = false;
    setup();

    const [prev, next] = buttons();
    expect(prev.props('disabled')).toBe(true);
    expect(next.props('disabled')).toBe(true);

    h.yt.searchResults = [video('a')];
    await wrapper!.setProps({});
    expect(wrapper!.findAllComponents(ButtonStub)).toHaveLength(0);
  });

  it('offers loading more SoundCloud results', async () => {
    h.yt.hasNextPage = false;
    h.yt.hasMoreSc = true;
    h.yt.searchLoadingMore = true;
    setup();

    const button = buttons()[0];
    expect(button.props('disabled')).toBe(true);
    expect(button.find('.animate-spin').exists()).toBe(true);

    h.yt.searchLoadingMore = false;
    await wrapper!.vm.$nextTick();
    await button.trigger('click');
    expect(h.yt.loadMoreSearch).toHaveBeenCalled();
  });
});
