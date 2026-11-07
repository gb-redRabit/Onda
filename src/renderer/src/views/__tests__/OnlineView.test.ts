import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import SubscribeConfigDialogMock from '@renderer/components/online/SubscribeConfigDialog.vue';
import DownloadConfigDialogMock from '@renderer/components/online/DownloadConfigDialog.vue';
import OnlineView from '../OnlineView.vue';

const state = vi.hoisted(() => ({
  yt: null as any,
  providerStore: null as any,
  saved: null as any,
  profiles: null as any,
  subscriptions: null as any,
  search: null as any,
  dialogs: null as any,
  queueing: null as any,
  savedPlaylist: null as any,
  batch: null as any,
  onlineSearchArgs: [] as unknown[],
  setupArgs: [] as unknown[],
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));
vi.mock('@renderer/stores/providers', () => ({ useProvidersStore: () => state.providerStore }));
vi.mock('@renderer/stores/saved', () => ({ useSavedStore: () => state.saved }));
vi.mock('@renderer/composables/useDownloadProfiles', () => ({
  useDownloadProfiles: () => ({ profiles: state.profiles })
}));
vi.mock('@renderer/composables/useOnlineSearch', () => ({
  useOnlineSearch: (...args: unknown[]) => {
    state.onlineSearchArgs = args;
    return state.search;
  }
}));
vi.mock('@renderer/composables/useOnlineSubscriptions', () => ({
  useOnlineSubscriptions: () => state.subscriptions
}));
vi.mock('@renderer/composables/useOnlineDialogs', () => ({
  useOnlineDialogs: () => state.dialogs
}));
vi.mock('@renderer/composables/useOnlineQueueing', () => ({
  useOnlineQueueing: () => state.queueing
}));
vi.mock('@renderer/composables/useOnlineViewSetup', () => ({
  useOnlineViewSetup: (...args: unknown[]) => {
    state.setupArgs = args;
  }
}));
vi.mock('@renderer/composables/useOnlineSavedPlaylist', () => ({
  useOnlineSavedPlaylist: () => state.savedPlaylist
}));
vi.mock('@renderer/composables/useOnlineBatch', () => ({
  useOnlineBatch: () => state.batch
}));
vi.mock('@renderer/utils/onlineConfigDialog', () => ({
  configDialogTitle: (target: any, count: number) => `title:${target?.mode}:${count}`,
  configDialogChannelTitle: (target: any, resolved: any) =>
    target?.mode === 'channel' ? `channel:${resolved?.channel?.title}` : '',
  configDialogPlaylistTitle: (target: any, resolved: any) =>
    target?.mode === 'playlist' ? `playlist:${resolved?.title}` : '',
  configDialogPlatform: (target: any, resolved: any, itemUrl: string) =>
    target?.mode === 'single' ? resolved?.platform || itemUrl.split(':')[0] : 'multi'
}));

vi.mock('@renderer/components/online/OnlineChannelView.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return { __esModule: true, default: stub('channel-view') };
});
vi.mock('@renderer/components/online/DownloadConfigDialog.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('download-config', {
      props: ['title', 'thumbnail', 'channelTitle', 'playlistTitle', 'platform'],
      emits: ['confirm', 'cancel']
    })
  };
});
vi.mock('@renderer/components/online/SubscribeConfigDialog.vue', async () => {
  const { stub } = await import('./lazyStubs');
  return {
    __esModule: true,
    default: stub('subscribe-config', {
      props: ['mode', 'channel', 'platform', 'initialPrefs'],
      emits: ['confirm', 'cancel']
    })
  };
});

const HeaderStub = defineComponent({
  props: ['title', 'icon', 'sticky', 'elevated', 'compact'],
  template: '<div data-testid="page-header"><slot name="actions" /><slot /></div>'
});
const SearchBarStub = defineComponent({
  props: ['modelValue', 'isResolving', 'isSearching', 'batchOpen', 'batchCount'],
  emits: ['update:modelValue', 'submit', 'toggle-batch'],
  template: '<div data-testid="search-bar" />'
});
const BatchStub = defineComponent({
  props: [
    'text',
    'profileId',
    'open',
    'entries',
    'skippedCount',
    'hasSc',
    'profiles',
    'busy',
    'result'
  ],
  emits: ['update:text', 'update:profileId', 'import-file', 'submit'],
  template: '<div data-testid="batch-panel" />'
});
const TabsStub = defineComponent({
  props: ['modelValue', 'subscriptionCount'],
  emits: ['update:modelValue'],
  template: '<div data-testid="tabs"><slot /></div>'
});
const ButtonStub = defineComponent({
  props: ['variant', 'size', 'disabled', 'title'],
  emits: ['click'],
  template: '<button data-testid="online-button" @click="$emit(\'click\')"><slot /></button>'
});
const SubsPanelStub = defineComponent({
  props: ['subscriptions', 'loaded', 'checkingChannelId', 'isQueuing'],
  emits: [
    'open-channel',
    'download-all',
    'check-now',
    'toggle-auto-download',
    'open-prefs',
    'unfollow',
    'discover'
  ],
  template: '<div data-testid="subs-panel" />'
});
const ProviderSubsStub = defineComponent({
  emits: ['open'],
  template: '<div data-testid="provider-subs" />'
});
const ProviderPanelStub = { template: '<div data-testid="provider-panel" />' };
const ChannelErrorStub = defineComponent({
  props: ['message'],
  emits: ['retry'],
  template: '<div data-testid="channel-error" />'
});
const ResolvedStub = defineComponent({
  props: [
    'expandedId',
    'rangeStart',
    'rangeEnd',
    'resolvedLoading',
    'resolvedCapped',
    'selectedCount',
    'saved',
    'saving'
  ],
  emits: [
    'update:expandedId',
    'update:rangeStart',
    'update:rangeEnd',
    'toggle-select',
    'quick-queue',
    'options',
    'open-window',
    'open-channel',
    'download-all',
    'play-all',
    'save',
    'clear',
    'select-all',
    'select-range',
    'add-selected',
    'load-more'
  ],
  template: '<div data-testid="resolved-panel" />'
});
const ResultsStub = defineComponent({
  props: ['expandedId'],
  emits: ['update:expandedId', 'quick-queue', 'options', 'open-window', 'open-channel'],
  template: '<div data-testid="results-panel" />'
});
const ConfirmStub = defineComponent({
  props: ['title', 'message', 'confirmText', 'cancelText', 'variant'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="confirm-dialog" />'
});
const AuthStub = { template: '<div data-testid="auth" />' };
const LoaderStub = { template: '<div data-testid="loader" />' };

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(OnlineView, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        PageHeader: HeaderStub,
        OnlineSearchBar: SearchBarStub,
        OnlineBatchPanel: BatchStub,
        OnlineViewTabs: TabsStub,
        OnlineButton: ButtonStub,
        OnlineSubscriptionsPanel: SubsPanelStub,
        ProviderSubscriptionsPanel: ProviderSubsStub,
        ProviderPanel: ProviderPanelStub,
        OnlineChannelError: ChannelErrorStub,
        OnlineResolvedPanel: ResolvedStub,
        OnlineSearchResultsPanel: ResultsStub,
        OnlineConfirmDialog: ConfirmStub,
        YTAuthButton: AuthStub,
        Loader: LoaderStub
      }
    }
  });
  return wrapper;
}

function ytState(overrides: Record<string, unknown> = {}) {
  return reactive({
    isResolving: false,
    isSearching: false,
    subscriptions: [],
    queueingChannelIds: new Set<string>(),
    checkingSubscriptions: false,
    subscriptionsLoaded: false,
    checkingChannelId: null,
    isChannelQueuing: false,
    channelLoading: false,
    channel: null,
    channelError: '',
    resolved: null,
    resolvedLoading: false,
    resolvedCapped: false,
    selectedResolved: new Set<string>(),
    itemUrl: 'https://youtube.com/watch?v=1',
    setResolved: vi.fn(),
    setResults: vi.fn(),
    closeChannel: vi.fn(),
    openChannel: vi.fn(),
    checkSubscriptionsNow: vi.fn(),
    checkChannelNow: vi.fn(),
    setAutoDownload: vi.fn(),
    setDownloadPrefs: vi.fn(),
    playAllStreams: vi.fn(),
    loadMoreResolved: vi.fn(),
    ...overrides
  });
}

beforeEach(() => {
  state.yt = ytState();
  state.providerStore = {
    detected: null,
    detect: vi.fn().mockResolvedValue(true),
    reset: vi.fn()
  };
  state.saved = { ensureLoaded: vi.fn() };
  state.profiles = ref([]);
  state.subscriptions = {
    activeSection: ref('discover'),
    prefsOpen: ref(null),
    unfollowTarget: ref(null),
    openDiscover: vi.fn(),
    togglePrefs: vi.fn(),
    openChannelFromSubscription: vi.fn(),
    downloadSubscriptionAll: vi.fn(),
    downloadAllPending: vi.fn(),
    confirmUnfollow: vi.fn(),
    onUnfollowConfirm: vi.fn()
  };
  state.search = {
    searchError: ref(''),
    resolveError: ref(''),
    submit: vi.fn(),
    cancelPending: vi.fn()
  };
  state.dialogs = {
    expandedSearchId: ref(null),
    expandedResolvedId: ref(null),
    configTarget: ref(null),
    openWatchUrl: vi.fn(),
    onKeydown: vi.fn(),
    toastAdded: vi.fn()
  };
  state.queueing = {
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
    selectRange: vi.fn(),
    addSelectedToQueue: vi.fn(),
    queueResolvedItem: vi.fn(),
    queueChannelVideo: vi.fn(),
    quickQueueResolved: vi.fn(),
    quickQueueVideo: vi.fn(),
    closeQueueConfig: vi.fn(),
    confirmQueueConfig: vi.fn()
  };
  state.savedPlaylist = {
    savingPlaylist: ref(false),
    saveResolvedPlaylist: vi.fn(),
    resolvedSaved: ref(true)
  };
  state.batch = {
    batchOpen: ref(false),
    batchText: ref(''),
    batchBusy: ref(false),
    batchResult: ref(null),
    batchProfileId: ref('p1'),
    batchEntries: ref([{ id: 1 }]),
    batchSkippedCount: ref(2),
    batchHasSc: ref(true),
    submitBatch: vi.fn(),
    importBatchFile: vi.fn()
  };
  state.onlineSearchArgs = [];
  state.setupArgs = [];
  (window as { api?: unknown }).api = { invoke: vi.fn(), send: vi.fn() };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('setup', () => {
  it('loads saved items and wires dependent composables', () => {
    mountView();
    expect(state.saved.ensureLoaded).toHaveBeenCalled();
    expect(state.onlineSearchArgs).toHaveLength(4);
    expect(state.onlineSearchArgs[3]).toBeTypeOf('function');
    expect(state.setupArgs).toHaveLength(2);
    expect(wrapper!.find('[data-testid="auth"]').exists()).toBe(true);
  });

  it('passes store state to the header, search bar, batch panel and tabs', async () => {
    state.yt.isResolving = true;
    state.yt.isSearching = true;
    state.yt.subscriptions = [{ id: 's1' }];
    state.batch.batchOpen.value = true;
    mountView();
    await flushPromises();

    const header = wrapper!.findComponent(HeaderStub);
    expect(header.props('elevated')).toBe(false);
    expect(header.props('compact')).toBe(false);

    expect(wrapper!.findComponent(SearchBarStub).props()).toMatchObject({
      isResolving: true,
      isSearching: true,
      batchOpen: true,
      batchCount: 1
    });
    expect(wrapper!.findComponent(BatchStub).props()).toMatchObject({
      open: true,
      skippedCount: 2,
      hasSc: true,
      profiles: state.profiles.value,
      busy: false,
      result: null
    });
    expect(wrapper!.findComponent(TabsStub).props('subscriptionCount')).toBe(1);
  });

  it('toggles header elevation on scroll and ignores non-scroll targets', async () => {
    mountView();
    const header = wrapper!.findComponent(HeaderStub);
    const root = wrapper!.get('[data-testid="online-view"]');
    Object.defineProperty(root.element, 'scrollTop', { value: 20, configurable: true });

    root.element.dispatchEvent(new Event('scroll'));
    await wrapper!.vm.$nextTick();
    expect(header.props('elevated')).toBe(true);
    expect(header.props('compact')).toBe(true);

    root.element.dispatchEvent(new Event('scroll'));
    expect(header.props('elevated')).toBe(true);

    window.dispatchEvent(new Event('scroll'));
    await wrapper!.vm.$nextTick();
    expect(header.props('elevated')).toBe(true);
  });

  it('binds the search input and submit event', async () => {
    mountView();
    const search = wrapper!.findComponent(SearchBarStub);
    search.vm.$emit('update:modelValue', 'query');
    await wrapper!.vm.$nextTick();
    expect(search.props('modelValue')).toBe('query');

    search.vm.$emit('submit');
    expect(state.search.submit).toHaveBeenCalled();
  });

  it('toggles the batch panel and forwards batch bindings', async () => {
    mountView();
    const search = wrapper!.findComponent(SearchBarStub);
    search.vm.$emit('toggle-batch');
    await wrapper!.vm.$nextTick();
    expect(state.batch.batchOpen.value).toBe(true);

    const batch = wrapper!.findComponent(BatchStub);
    batch.vm.$emit('update:text', 'lines');
    batch.vm.$emit('update:profileId', 'p2');
    await wrapper!.vm.$nextTick();
    expect(state.batch.batchText.value).toBe('lines');
    expect(state.batch.batchProfileId.value).toBe('p2');

    batch.vm.$emit('import-file');
    batch.vm.$emit('submit');
    expect(state.batch.importBatchFile).toHaveBeenCalled();
    expect(state.batch.submitBatch).toHaveBeenCalled();
  });
});

describe('provider links', () => {
  it('switches to links and clears state when detection succeeds', async () => {
    mountView();
    const handleProviderLink = state.onlineSearchArgs[3] as (url: string) => Promise<boolean>;
    const ok = await handleProviderLink('https://mega.nz/share');

    expect(ok).toBe(true);
    expect(state.providerStore.detect).toHaveBeenCalledWith('https://mega.nz/share');
    expect(state.search.cancelPending).toHaveBeenCalled();
    expect(state.subscriptions.activeSection.value).toBe('links');
    expect(state.yt.setResolved).toHaveBeenCalledWith(null);
    expect(state.yt.setResults).toHaveBeenCalledWith([]);
    expect(state.yt.closeChannel).toHaveBeenCalled();
  });

  it('leaves the view untouched when detection fails', async () => {
    state.providerStore.detect.mockResolvedValue(false);
    mountView();
    const handleProviderLink = state.onlineSearchArgs[3] as (url: string) => Promise<boolean>;
    expect(await handleProviderLink('https://example.com')).toBe(false);
    expect(state.subscriptions.activeSection.value).toBe('discover');
    expect(state.yt.setResolved).not.toHaveBeenCalled();
  });

  it('opens provider subscriptions through the links tab', async () => {
    state.subscriptions.activeSection.value = 'subscriptions';
    mountView();
    wrapper!.findComponent(ProviderSubsStub).vm.$emit('open', 'https://mega.nz/x');
    expect(state.search.cancelPending).toHaveBeenCalled();
    expect(state.subscriptions.activeSection.value).toBe('links');
    expect(state.providerStore.detect).toHaveBeenCalledWith('https://mega.nz/x');
  });
});

describe('subscriptions tab', () => {
  function showSubscriptions() {
    state.subscriptions.activeSection.value = 'subscriptions';
    mountView();
    return wrapper!;
  }

  it('renders subscription actions and forwards panel events', async () => {
    const view = showSubscriptions();
    await flushPromises();
    await vi.dynamicImportSettled();

    expect(view.findComponent(SubsPanelStub).props()).toMatchObject({
      loaded: false,
      checkingChannelId: null,
      isQueuing: false
    });

    const buttons = view.findAll('[data-testid="online-button"]');
    await buttons[0].trigger('click');
    expect(state.subscriptions.downloadAllPending).toHaveBeenCalled();
    await buttons[1].trigger('click');
    expect(state.yt.checkSubscriptionsNow).toHaveBeenCalled();

    const panel = view.findComponent(SubsPanelStub);
    panel.vm.$emit('open-channel', 'UC1');
    expect(state.subscriptions.openChannelFromSubscription).toHaveBeenCalledWith('UC1');
    panel.vm.$emit('download-all', 'UC2');
    expect(state.subscriptions.downloadSubscriptionAll).toHaveBeenCalledWith('UC2');
    panel.vm.$emit('check-now', 'UC3');
    expect(state.yt.checkChannelNow).toHaveBeenCalledWith('UC3');
    panel.vm.$emit('toggle-auto-download', 'UC4', true);
    expect(state.yt.setAutoDownload).toHaveBeenCalledWith('UC4', true);
    panel.vm.$emit('open-prefs', { channelId: 'UC5' });
    expect(state.subscriptions.togglePrefs).toHaveBeenCalledWith({ channelId: 'UC5' });
    panel.vm.$emit('unfollow', 'UC6');
    expect(state.subscriptions.confirmUnfollow).toHaveBeenCalledWith('UC6');
    expect(view.find('[data-testid="provider-subs"]').exists()).toBe(true);
    panel.vm.$emit('discover');
    await view.vm.$nextTick();
    expect(state.subscriptions.activeSection.value).toBe('discover');
    expect(view.find('[data-testid="provider-subs"]').exists()).toBe(false);
  });

  it('shows the downloading label while channels are queued', async () => {
    state.yt.queueingChannelIds = new Set(['UC1']);
    const view = showSubscriptions();
    const buttons = view.findAllComponents(ButtonStub);
    expect(buttons[0].props('disabled')).toBe(true);
    expect(view.text()).toContain('youtube.downloading');

    state.yt.checkingSubscriptions = true;
    await view.vm.$nextTick();
    expect(view.findAllComponents(ButtonStub)[1].props('disabled')).toBe(true);
  });

  it('saves subscription preferences and closes the dialog', async () => {
    state.subscriptions.prefsOpen.value = {
      channelId: 'UC1',
      channelTitle: 'Title',
      channelThumbnail: 'thumb.png',
      platform: 'soundcloud',
      downloadPrefs: { quality: 'best' }
    };
    const view = showSubscriptions();
    await flushPromises();
    await vi.dynamicImportSettled();
    const dialog = view.findComponent(SubscribeConfigDialogMock as never) as any;
    expect(dialog.props()).toMatchObject({
      mode: 'edit',
      platform: 'soundcloud',
      channel: { channelId: 'UC1', channelTitle: 'Title', channelThumbnail: 'thumb.png' }
    });

    dialog.vm.$emit('confirm', { prefs: { quality: 'high' } });
    expect(state.yt.setDownloadPrefs).toHaveBeenCalledWith('UC1', { quality: 'high' });
    expect(state.subscriptions.prefsOpen.value).toBeNull();
  });

  it('defaults preferences to an empty object and closes on cancel', async () => {
    state.subscriptions.prefsOpen.value = { channelId: 'UC1', platform: 'youtube' };
    const view = showSubscriptions();
    await flushPromises();
    await vi.dynamicImportSettled();
    const dialog = view.findComponent(SubscribeConfigDialogMock as never) as any;
    expect(dialog.props('platform')).toBe('youtube');

    dialog.vm.$emit('confirm', {});
    expect(state.yt.setDownloadPrefs).toHaveBeenCalledWith('UC1', {});

    state.subscriptions.prefsOpen.value = { channelId: 'UC2' };
    await view.vm.$nextTick();
    const reopened = view.findComponent(SubscribeConfigDialogMock as never) as any;
    reopened.vm.$emit('cancel');
    expect(state.subscriptions.prefsOpen.value).toBeNull();
  });

  it('renders the unfollow confirmation and forwards actions', async () => {
    state.subscriptions.unfollowTarget.value = { channelId: 'UC1' };
    const view = showSubscriptions();
    await flushPromises();
    await vi.dynamicImportSettled();
    const dialog = view.findComponent(ConfirmStub);
    expect(dialog.props()).toMatchObject({
      title: 'youtube.unsubscribeChannel',
      message: 'youtube.unsubscribeChannelConfirm',
      variant: 'danger'
    });

    dialog.vm.$emit('confirm');
    expect(state.subscriptions.onUnfollowConfirm).toHaveBeenCalled();
    dialog.vm.$emit('cancel');
    expect(state.subscriptions.unfollowTarget.value).toBeNull();
  });
});

describe('links tab', () => {
  it('renders the provider panel and clears the detected provider', async () => {
    state.subscriptions.activeSection.value = 'links';
    state.providerStore.detected = { id: 'pikpak' };
    mountView();

    const button = wrapper!.get('[data-testid="online-button"]');
    await button.trigger('click');
    expect(state.providerStore.reset).toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="provider-panel"]').exists()).toBe(true);
  });
});

describe('discover tab', () => {
  it('shows the channel view while loading or loaded', async () => {
    state.yt.channelLoading = true;
    mountView();
    await flushPromises();
    expect(wrapper!.find('[data-testid="channel-view"]').exists()).toBe(true);

    state.yt.channelLoading = false;
    state.yt.channel = { id: 'UC1' };
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="channel-view"]').exists()).toBe(true);
  });

  it('shows the channel error and retries through submit', async () => {
    state.yt.channelError = 'boom';
    mountView();
    await flushPromises();
    expect(wrapper!.findComponent(ChannelErrorStub).props('message')).toBe('boom');
    wrapper!.findComponent(ChannelErrorStub).vm.$emit('retry');
    expect(state.search.submit).toHaveBeenCalled();
  });

  it('renders resolved results and forwards every action', async () => {
    state.yt.resolved = { items: [{ id: 'v1' }], title: 'Playlist', platform: 'youtube' };
    state.yt.resolvedLoading = true;
    state.yt.resolvedCapped = true;
    state.yt.selectedResolved = new Set(['a', 'b']);
    mountView();
    await flushPromises();

    const panel = wrapper!.findComponent(ResolvedStub);
    expect(panel.props()).toMatchObject({
      resolvedLoading: true,
      resolvedCapped: true,
      selectedCount: 2,
      saved: true,
      saving: false
    });

    await wrapper!.get('[data-testid="online-button"]').trigger('click');
    expect(state.yt.setResolved).toHaveBeenCalledWith(null);

    panel.vm.$emit('update:expandedId', 'id1');
    panel.vm.$emit('update:rangeStart', 5);
    panel.vm.$emit('update:rangeEnd', 9);
    await wrapper!.vm.$nextTick();
    expect(state.dialogs.expandedResolvedId.value).toBe('id1');
    expect(panel.props('rangeStart')).toBe(5);
    expect(panel.props('rangeEnd')).toBe(9);

    panel.vm.$emit('toggle-select');
    expect(state.queueing.toggleSelect).toHaveBeenCalled();
    panel.vm.$emit('quick-queue');
    expect(state.queueing.quickQueueResolved).toHaveBeenCalled();
    panel.vm.$emit('options');
    expect(state.queueing.queueResolvedItem).toHaveBeenCalled();
    panel.vm.$emit('open-window');
    expect(state.dialogs.openWatchUrl).toHaveBeenCalled();
    panel.vm.$emit('download-all');
    expect(state.queueing.addSelectedToQueue).toHaveBeenCalled();
    panel.vm.$emit('play-all');
    expect(state.yt.playAllStreams).toHaveBeenCalledWith([{ id: 'v1' }]);
    panel.vm.$emit('save');
    expect(state.savedPlaylist.saveResolvedPlaylist).toHaveBeenCalled();
    panel.vm.$emit('clear');
    expect(state.yt.setResolved).toHaveBeenLastCalledWith(null);
    panel.vm.$emit('select-all');
    expect(state.queueing.toggleSelectAll).toHaveBeenCalled();
    panel.vm.$emit('select-range');
    expect(state.queueing.selectRange).toHaveBeenCalled();
    panel.vm.$emit('add-selected');
    expect(state.queueing.addSelectedToQueue).toHaveBeenCalledTimes(2);
    panel.vm.$emit('load-more');
    expect(state.yt.loadMoreResolved).toHaveBeenCalled();
  });

  it('opens channels from resolved results in the discover tab', async () => {
    state.yt.resolved = { items: [] };
    mountView();
    await flushPromises();
    wrapper!.findComponent(ResolvedStub).vm.$emit('open-channel', 'https://yt/channel');
    expect(state.search.cancelPending).toHaveBeenCalled();
    expect(state.subscriptions.activeSection.value).toBe('discover');
    expect(state.yt.openChannel).toHaveBeenCalledWith('https://yt/channel');
  });

  it('renders the search results panel and forwards actions', async () => {
    mountView();
    await flushPromises();
    const panel = wrapper!.findComponent(ResultsStub);
    expect(wrapper!.find('[data-testid="results-panel"]').exists()).toBe(true);

    panel.vm.$emit('update:expandedId', 'v1');
    await wrapper!.vm.$nextTick();
    expect(state.dialogs.expandedSearchId.value).toBe('v1');
    panel.vm.$emit('quick-queue');
    expect(state.queueing.quickQueueVideo).toHaveBeenCalled();
    panel.vm.$emit('options');
    expect(state.queueing.queueChannelVideo).toHaveBeenCalled();
    panel.vm.$emit('open-window');
    expect(state.dialogs.openWatchUrl).toHaveBeenCalled();
    panel.vm.$emit('open-channel', 'https://yt/c');
    expect(state.yt.openChannel).toHaveBeenCalledWith('https://yt/c');
  });

  it('renders search and resolve errors', async () => {
    state.search.searchError.value = 'search failed';
    state.search.resolveError.value = 'resolve failed';
    mountView();
    await flushPromises();
    expect(wrapper!.text()).toContain('search failed');
    expect(wrapper!.text()).toContain('resolve failed');

    state.search.resolveError.value = '';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('resolve failed');
  });
});

describe('download config dialog', () => {
  it('derives dialog labels and platform from the queue target', async () => {
    state.dialogs.configTarget.value = {
      mode: 'single',
      video: { thumbnail: 'thumb.png' }
    };
    state.yt.resolved = { platform: 'vimeo', channel: { title: 'C' }, title: 'P' };
    mountView();
    await flushPromises();
    await vi.dynamicImportSettled();

    const dialog = wrapper!.findComponent(DownloadConfigDialogMock as never) as any;
    expect(dialog.props()).toMatchObject({
      title: 'title:single:0',
      thumbnail: 'thumb.png',
      platform: 'vimeo'
    });

    dialog.vm.$emit('confirm', { quality: '1080p' });
    expect(state.queueing.confirmQueueConfig).toHaveBeenCalledWith({ quality: '1080p' });
    dialog.vm.$emit('cancel');
    expect(state.queueing.closeQueueConfig).toHaveBeenCalled();
  });

  it('uses multi-target titles and omits the single thumbnail', async () => {
    state.dialogs.configTarget.value = { mode: 'channel', video: { thumbnail: 'x.png' } };
    state.yt.resolved = { platform: 'youtube', channel: { title: 'My Channel' }, title: 'P' };
    mountView();
    await flushPromises();
    await vi.dynamicImportSettled();

    const dialog = wrapper!.findComponent(DownloadConfigDialogMock as never) as any;
    expect(dialog.props()).toMatchObject({
      title: 'title:channel:0',
      channelTitle: 'channel:My Channel',
      playlistTitle: undefined,
      platform: 'multi'
    });
    expect(dialog.props('thumbnail')).toBeUndefined();
  });

  it('passes playlist titles for playlist targets', async () => {
    state.dialogs.configTarget.value = { mode: 'playlist', video: {} };
    state.yt.resolved = { platform: 'youtube', channel: { title: 'C' }, title: 'My Playlist' };
    mountView();
    await flushPromises();
    const playlistDialog = wrapper!.findComponent(DownloadConfigDialogMock as never) as any;
    expect(playlistDialog.props('playlistTitle')).toBe('playlist:My Playlist');
  });
});
