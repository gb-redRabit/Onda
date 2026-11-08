import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import WebcastSavedPlaylists from '../WebcastSavedPlaylists.vue';

const state = vi.hoisted(() => ({
  saved: null as any,
  yt: null as any,
  router: { push: vi.fn() },
  gridObserve: vi.fn(),
  gridDestroy: vi.fn(),
  rowItems: [] as any[],
  rowTotal: 0,
  promptVisible: null as any,
  promptIsConfirm: null as any,
  promptMessage: null as any,
  promptValue: null as any,
  showConfirm: vi.fn(),
  promptConfirm: vi.fn(),
  promptCancel: vi.fn(),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('vue-router', () => ({ useRouter: () => state.router }));
vi.mock('@renderer/stores/saved', () => ({ useSavedStore: () => state.saved }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));
vi.mock('@shared/provider', () => ({
  buildYouTubeWatchUrl: (id: string) => `https://youtube.com/watch?v=${id}`
}));
vi.mock('@renderer/utils/savedItem', () => ({
  toResolvedItem: (item: any) => ({ id: item.id, title: item.title })
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => ({
    showConfirm: state.showConfirm,
    promptVisible: state.promptVisible,
    promptIsConfirm: state.promptIsConfirm,
    promptMessage: state.promptMessage,
    promptValue: state.promptValue,
    promptConfirm: state.promptConfirm,
    promptCancel: state.promptCancel
  })
}));
vi.mock('@renderer/composables/useVirtualGrid', () => ({
  useVirtualGrid: () => ({
    cols: ref(4),
    observe: state.gridObserve,
    destroy: state.gridDestroy
  })
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: () =>
    ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => state.rowTotal
    })
}));

const CardStub = defineComponent({
  props: ['video', 'coverStatus', 'watchUrl', 'hideQuickActions', 'layout'],
  emits: ['expand', 'queue', 'play', 'open-channel'],
  template: '<div data-testid="media-card" />'
});
const EmptyStub = defineComponent({
  props: ['title', 'icon', 'compact'],
  template: '<div data-testid="empty-state" />'
});
const LoaderStub = defineComponent({
  props: ['size'],
  template: '<div data-testid="loader" />'
});
const PromptStub = defineComponent({
  props: ['visible', 'isConfirm', 'message', 'value'],
  emits: ['update:value', 'confirm', 'cancel'],
  template: '<div data-testid="prompt-dialog" />'
});

let wrapper: VueWrapper | null = null;

function item(id: string) {
  return { id, title: `Item ${id}` } as any;
}

function playlist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pl1',
    url: 'https://youtube.com/playlist?list=1',
    title: 'Playlist One',
    channelTitle: 'Channel',
    totalItems: 12,
    thumbnail: 'thumb.jpg',
    items: [],
    ...overrides
  } as any;
}

function mountView() {
  wrapper = mount(WebcastSavedPlaylists, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        OnlineMediaCard: CardStub,
        EmptyState: EmptyStub,
        Loader: LoaderStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  return wrapper;
}

function expandButtons() {
  return wrapper!.findAll('button[title="saved.expandPlaylist"]');
}

beforeEach(() => {
  state.saved = reactive({
    playlists: [playlist()],
    removePlaylist: vi.fn().mockResolvedValue(undefined)
  });
  state.yt = reactive({
    syncingSavedPlaylistState: new Set<string>(),
    syncSavedPlaylist: vi.fn().mockResolvedValue({}),
    playSavedPlaylist: vi.fn().mockResolvedValue(undefined),
    queueVideo: vi.fn(),
    playStream: vi.fn(),
    openChannel: vi.fn().mockResolvedValue(undefined)
  });
  state.router.push.mockReset();
  state.router.push.mockResolvedValue(undefined);
  state.gridObserve.mockReset();
  state.gridDestroy.mockReset();
  state.rowItems = [{ index: 0, start: 0 }];
  state.rowTotal = 230;
  state.promptVisible = ref(false);
  state.promptIsConfirm = ref(true);
  state.promptMessage = ref('message');
  state.promptValue = ref('');
  state.showConfirm.mockReset();
  state.showConfirm.mockResolvedValue(true);
  state.promptConfirm.mockReset();
  state.promptCancel.mockReset();
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('empty state and header', () => {
  it('shows the empty state when there are no playlists', () => {
    state.saved.playlists = [];
    mountView();
    expect(wrapper!.findComponent(EmptyStub).props('title')).toBe('saved.emptyPlaylists');
    expect(wrapper!.text()).toContain('saved.playlistsTitle (0)');
  });

  it('renders playlist headers with metadata and thumbnails', () => {
    mountView();
    expect(wrapper!.text()).toContain('saved.playlistsTitle (1)');
    expect(wrapper!.text()).toContain('Playlist One');
    expect(wrapper!.text()).toContain('Channel');
    expect(wrapper!.text()).toContain('12');
    expect(wrapper!.get('img').attributes('src')).toBe('thumb.jpg');
    expect(wrapper!.get('img').attributes('alt')).toBe('Playlist One');
  });

  it('falls back to the playlist kind and icon when metadata is missing', () => {
    state.saved.playlists = [
      playlist({ channelTitle: '', totalItems: null, thumbnail: '' }),
      playlist({ id: 'pl2', title: 'Second', thumbnail: '' })
    ];
    mountView();
    expect(wrapper!.text()).toContain('saved.kindPlaylist');
    expect(wrapper!.findAll('img')).toHaveLength(0);
  });
});

describe('expanding playlists', () => {
  it('collapses an expanded playlist without syncing', async () => {
    state.saved.playlists = [playlist({ items: [item('a')] })];
    mountView();
    await expandButtons()[0].trigger('click');
    expect(expandButtons()[0].attributes('aria-expanded')).toBe('true');
    expect(wrapper!.findAll('[data-testid="media-card"]')).toHaveLength(1);
    expect(state.yt.syncSavedPlaylist).not.toHaveBeenCalled();

    await expandButtons()[0].trigger('click');
    expect(expandButtons()[0].attributes('aria-expanded')).toBe('false');
    expect(state.gridDestroy).toHaveBeenCalled();
  });

  it('observes the grid after expanding', async () => {
    state.saved.playlists = [playlist({ items: [item('a')] })];
    mountView();
    await expandButtons()[0].trigger('click');
    await flushPromises();
    expect(state.gridObserve).toHaveBeenCalled();
  });

  it('syncs an empty playlist when expanded', async () => {
    mountView();
    await expandButtons()[0].trigger('click');
    await flushPromises();
    expect(state.yt.syncSavedPlaylist).toHaveBeenCalledWith(state.saved.playlists[0]);
  });

  it('marks a playlist as failed when sync returns null and leaves it empty', async () => {
    state.yt.syncSavedPlaylist.mockResolvedValue(null);
    mountView();
    await expandButtons()[0].trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('saved.playlistLoadError');
  });

  it('keeps fetched items after a null sync result', async () => {
    state.yt.syncSavedPlaylist.mockImplementation(async () => {
      state.saved.playlists[0].items = [item('synced')];
      return null;
    });
    mountView();
    await expandButtons()[0].trigger('click');
    await flushPromises();
    expect(wrapper!.findAll('[data-testid="media-card"]')).toHaveLength(1);
    expect(wrapper!.text()).not.toContain('saved.playlistLoadError');
  });

  it('shows a loader while syncing', async () => {
    state.yt.syncingSavedPlaylistState.add('pl1');
    mountView();
    await expandButtons()[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(true);
  });

  it('switches expansion between playlists', async () => {
    state.saved.playlists = [
      playlist({ items: [item('a')] }),
      playlist({ id: 'pl2', title: 'Second', items: [item('b')] })
    ];
    mountView();
    const buttons = expandButtons();
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(buttons[0].attributes('aria-expanded')).toBe('false');
    expect(buttons[1].attributes('aria-expanded')).toBe('true');
    expect(wrapper!.findAll('[data-testid="media-card"]')).toHaveLength(1);
  });
});

describe('virtual rows', () => {
  it('slices expanded items into grid rows', async () => {
    const items = Array.from({ length: 6 }, (_, index) => item(`i${index}`));
    state.saved.playlists = [playlist({ items })];
    state.rowItems = [
      { index: 0, start: 0 },
      { index: 1, start: 230 }
    ];
    state.rowTotal = 460;
    mountView();
    await expandButtons()[0].trigger('click');

    const cards = wrapper!.findAllComponents(CardStub);
    expect(cards).toHaveLength(6);
    const rows = wrapper!.findAll('.absolute.top-0.left-0.grid');
    expect(rows).toHaveLength(2);
    expect(rows[1].attributes('style')).toContain('translateY(230px)');
    expect(rows[0].attributes('style')).toContain('repeat(4, minmax(0, 1fr))');
    expect(cards[0].props()).toMatchObject({
      coverStatus: 'none',
      watchUrl: 'https://youtube.com/watch?v=i0',
      hideQuickActions: true,
      layout: 'grid'
    });
  });

  it('forwards media card actions', async () => {
    state.saved.playlists = [playlist({ items: [item('a')] })];
    state.rowItems = [{ index: 0, start: 0 }];
    mountView();
    await expandButtons()[0].trigger('click');

    const card = wrapper!.findComponent(CardStub);
    card.vm.$emit('queue');
    card.vm.$emit('play');
    expect(state.yt.queueVideo).toHaveBeenCalledWith({ id: 'a', title: 'Item a' });
    expect(state.yt.playStream).toHaveBeenCalledWith({ id: 'a', title: 'Item a' });

    card.vm.$emit('open-channel', 'https://youtube.com/@channel');
    await flushPromises();
    expect(state.router.push).toHaveBeenCalledWith('/online');
    expect(state.yt.openChannel).toHaveBeenCalledWith('https://youtube.com/@channel');

    card.vm.$emit('expand');
    await wrapper!.vm.$nextTick();
    expect(expandButtons()[0].attributes('aria-expanded')).toBe('false');
  });
});

describe('play and delete', () => {
  it('plays a playlist and disables the button while running', async () => {
    let resolvePlay: () => void = () => {};
    state.yt.playSavedPlaylist.mockImplementation(
      () => new Promise<void>((resolve) => (resolvePlay = resolve))
    );
    mountView();
    const play = wrapper!.get('button[title="youtube.playAll"]');
    await play.trigger('click');
    expect(state.yt.playSavedPlaylist).toHaveBeenCalledWith(state.saved.playlists[0]);
    expect(play.attributes('disabled')).toBeDefined();
    expect(play.find('.animate-spin').exists()).toBe(true);

    await play.trigger('click');
    expect(state.yt.playSavedPlaylist).toHaveBeenCalledTimes(1);

    resolvePlay();
    await flushPromises();
    expect(play.attributes('disabled')).toBeUndefined();
  });

  it('asks for confirmation before deleting a playlist', async () => {
    mountView();
    await wrapper!.get('button[title="common.delete"]').trigger('click');
    await flushPromises();
    expect(state.showConfirm).toHaveBeenCalledWith(
      `saved.deletePlaylistConfirm:${JSON.stringify({ name: 'Playlist One' })}`
    );
    expect(state.saved.removePlaylist).toHaveBeenCalledWith('pl1');
  });

  it('skips deletion when confirmation is declined', async () => {
    state.showConfirm.mockResolvedValue(false);
    mountView();
    await wrapper!.get('button[title="common.delete"]').trigger('click');
    await flushPromises();
    expect(state.saved.removePlaylist).not.toHaveBeenCalled();
  });

  it('collapses the playlist when it is deleted', async () => {
    state.saved.playlists = [playlist({ items: [item('a')] })];
    mountView();
    await expandButtons()[0].trigger('click');
    await wrapper!.get('button[title="common.delete"]').trigger('click');
    await flushPromises();
    expect(expandButtons()[0].attributes('aria-expanded')).toBe('false');
  });

  it('uses an empty name in the confirmation when the title is missing', async () => {
    state.saved.playlists = [playlist({ title: undefined })];
    mountView();
    await wrapper!.get('button[title="common.delete"]').trigger('click');
    await flushPromises();
    expect(state.showConfirm).toHaveBeenCalledWith(
      `saved.deletePlaylistConfirm:${JSON.stringify({ name: '' })}`
    );
  });
});

describe('prompt dialog and cleanup', () => {
  it('binds the prompt dialog values and actions', async () => {
    mountView();
    const dialog = wrapper!.findComponent(PromptStub);
    expect(dialog.props()).toMatchObject({
      visible: false,
      isConfirm: true,
      message: 'message',
      value: ''
    });

    dialog.vm.$emit('update:value', 'typed');
    expect(state.promptValue.value).toBe('typed');
    dialog.vm.$emit('confirm');
    dialog.vm.$emit('cancel');
    expect(state.promptConfirm).toHaveBeenCalled();
    expect(state.promptCancel).toHaveBeenCalled();
  });

  it('destroys the grid on unmount', () => {
    mountView();
    wrapper!.unmount();
    wrapper = null;
    expect(state.gridDestroy).toHaveBeenCalled();
  });
});
