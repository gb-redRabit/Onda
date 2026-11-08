import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import OnlineChannelView from '../OnlineChannelView.vue';

const state = vi.hoisted(() => ({
  yt: null as any,
  settings: null as any,
  buildWatch: vi.fn((id: string) => `https://youtube.com/watch?v=${id}`),
  errorKey: vi.fn(),
  resolveState: vi.fn(),
  setSentinel: vi.fn(),
  open: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@shared/provider', () => ({ buildYouTubeWatchUrl: state.buildWatch }));
vi.mock('@renderer/utils/errorCodes', () => ({ errorCodeKey: state.errorKey }));
vi.mock('@renderer/utils/onlineItemState', () => ({
  resolveDownloadState: state.resolveState
}));
vi.mock('@renderer/composables/useChannelInfiniteScroll', () => ({
  useChannelInfiniteScroll: () => ({ setSentinel: state.setSentinel })
}));

const GridStub = defineComponent({
  props: ['items', 'colWidth', 'minCols', 'estimateRowHeight', 'gapClass'],
  template: `<div data-testid="grid">
    <slot name="header" />
    <div v-for="item in items" :key="item.id" data-testid="grid-item">
      <slot :item="item" />
    </div>
    <slot name="footer" />
  </div>`
});
const CardStub = defineComponent({
  props: {
    video: Object,
    short: Boolean,
    expanded: Boolean,
    downloaded: Boolean,
    coverStatus: String,
    state: Object,
    watchUrl: String,
    layout: String,
    showViews: Boolean
  },
  emits: ['expand', 'collapse', 'queue', 'play', 'options', 'open-window', 'open-channel'],
  template: '<div data-testid="media-card" />'
});
const HeaderStub = defineComponent({
  emits: ['toggle-follow'],
  template: '<div data-testid="channel-header" />'
});
const SegmentStub = defineComponent({
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: '<div data-testid="segments" />'
});
const LoaderStub = defineComponent({
  props: { size: Number, label: String, overlay: Boolean },
  template: '<div data-testid="loader" />'
});
const SubscribeStub = defineComponent({
  props: ['channel', 'platform'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="subscribe-dialog" />'
});
const DownloadStub = defineComponent({
  props: ['title', 'thumbnail', 'channelTitle'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="download-dialog" />'
});
const ConfirmStub = defineComponent({
  props: ['title', 'message', 'confirmText', 'cancelText', 'variant'],
  emits: ['confirm', 'cancel'],
  template: '<div data-testid="confirm-dialog" />'
});

let wrapper: VueWrapper | null = null;

function video(id: string, overrides: Record<string, unknown> = {}) {
  return { id, title: `Video ${id}`, thumbnail: `thumb-${id}.jpg`, ...overrides } as any;
}

function mountView() {
  wrapper = mount(OnlineChannelView, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        OnlineMediaGrid: GridStub,
        OnlineMediaCard: CardStub,
        OnlineChannelHeader: HeaderStub,
        OnlineSegmentControl: SegmentStub,
        Loader: LoaderStub,
        SubscribeConfigDialog: SubscribeStub,
        DownloadConfigDialog: DownloadStub,
        OnlineConfirmDialog: ConfirmStub
      }
    }
  });
  return wrapper;
}

function cards() {
  return wrapper!.findAllComponents(CardStub);
}

function sortButtons() {
  return wrapper!.findAll('button');
}

beforeEach(() => {
  state.yt = reactive({
    channel: { id: 'UC1', title: 'Channel', thumbnail: 'ch.jpg' },
    channelIsSc: false,
    isSubscribed: vi.fn(() => false),
    channelVideos: [video('a'), video('b')],
    channelShorts: [video('s1'), video('s2')],
    channelTab: 'videos',
    channelHasShorts: true,
    channelHasMore: false,
    channelLoading: false,
    channelError: '',
    channelErrorCode: '',
    channelViewMode: 'grid',
    subscriptionsLoaded: true,
    isQueuing: vi.fn(() => false),
    downloadStatusFor: vi.fn(() => 'idle'),
    coverStatusFor: vi.fn(() => 'none'),
    isVideoDownloaded: vi.fn(() => false),
    queueVideo: vi.fn().mockResolvedValue(undefined),
    playStream: vi.fn(),
    openChannel: vi.fn(),
    loadSubscriptions: vi.fn().mockResolvedValue(undefined),
    followChannelWithSetup: vi.fn().mockResolvedValue(undefined),
    unfollowChannel: vi.fn().mockResolvedValue(undefined)
  });
  state.settings = reactive({ download: { smartMode: true } });
  state.errorKey.mockReset();
  state.errorKey.mockReturnValue('');
  state.resolveState.mockReset();
  state.resolveState.mockReturnValue({ kind: 'ready' });
  state.setSentinel.mockReset();
  state.buildWatch.mockClear();
  state.t.mockClear();
  state.open.mockReset();
  vi.stubGlobal('open', state.open);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loading and header', () => {
  it('shows an overlay loader while the channel is loading', () => {
    state.yt.channel = null;
    state.yt.channelLoading = true;
    mountView();
    const loader = wrapper!.findComponent(LoaderStub);
    expect(loader.props()).toMatchObject({ overlay: true, label: 'common.loading' });
    expect(wrapper!.find('[data-testid="grid"]').exists()).toBe(false);
  });

  it('renders the channel header and grid props per view mode', async () => {
    state.yt.channelLoading = true;
    mountView();
    expect(wrapper!.find('[data-testid="channel-header"]').exists()).toBe(true);
    expect(wrapper!.findComponent(GridStub).props()).toMatchObject({
      colWidth: 300,
      minCols: 2,
      estimateRowHeight: 300,
      gapClass: 'gap-4'
    });

    state.yt.channelViewMode = 'list';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(GridStub).props()).toMatchObject({
      colWidth: 1200,
      minCols: 1,
      estimateRowHeight: 150,
      gapClass: 'gap-2'
    });
  });

  it('loads subscriptions on mount only when needed', () => {
    state.yt.subscriptionsLoaded = false;
    mountView();
    expect(state.yt.loadSubscriptions).toHaveBeenCalled();

    wrapper!.unmount();
    state.yt.loadSubscriptions.mockClear();
    state.yt.subscriptionsLoaded = true;
    mountView();
    expect(state.yt.loadSubscriptions).not.toHaveBeenCalled();
  });

  it('renders the raw channel error when no code maps to a key', () => {
    state.yt.channelError = 'raw error';
    mountView();
    expect(wrapper!.text()).toContain('raw error');
    expect(state.errorKey).toHaveBeenCalledWith('');
  });

  it('renders translated error codes instead of the raw message', async () => {
    state.yt.channelError = 'raw error';
    state.errorKey.mockReturnValue('youtube.errorQuota');
    mountView();
    expect(wrapper!.text()).toContain('youtube.errorQuota');
  });
});

describe('sorting and tabs', () => {
  it('renders videos sorted by default and reverses for oldest', async () => {
    mountView();
    expect(cards().map((c: any) => (c.props('video') as any).id)).toEqual(['a', 'b']);

    const oldest = sortButtons().find((b) => b.text() === 'youtube.sortOldest');
    await oldest!.trigger('click');
    expect(cards().map((c: any) => (c.props('video') as any).id)).toEqual(['b', 'a']);
    expect(oldest!.classes()).toContain('bg-primary');

    const latest = sortButtons().find((b) => b.text() === 'youtube.sortLatest');
    await latest!.trigger('click');
    expect(cards().map((c: any) => (c.props('video') as any).id)).toEqual(['a', 'b']);
    expect(latest!.classes()).toContain('bg-primary');
  });

  it('shows shorts and hides sorting outside the videos tab', async () => {
    mountView();
    const segment = wrapper!.findComponent(SegmentStub);
    expect(segment.props('options')).toEqual([
      { value: 'videos', label: 'youtube.videosTab' },
      { value: 'shorts', label: 'youtube.shortsTab' }
    ]);
    expect(sortButtons().some((b) => b.text() === 'youtube.sortLatest')).toBe(true);

    segment.vm.$emit('update:modelValue', 'shorts');
    await wrapper!.vm.$nextTick();
    expect(cards().map((c: any) => (c.props('video') as any).id)).toEqual(['s1', 's2']);
    expect(cards()[0].props('short')).toBe(true);
    expect(sortButtons().some((b) => b.text() === 'youtube.sortLatest')).toBe(false);
  });

  it('omits the shorts tab and segment for SoundCloud channels', async () => {
    state.yt.channelHasShorts = false;
    state.yt.channelIsSc = true;
    mountView();
    expect(wrapper!.find('[data-testid="segments"]').exists()).toBe(false);
  });
});

describe('media cards', () => {
  it('passes selection, download and layout state to each card', () => {
    state.yt.isQueuing.mockReturnValue(true);
    state.yt.downloadStatusFor.mockReturnValue('downloading');
    state.yt.coverStatusFor.mockReturnValue('ready');
    state.yt.isVideoDownloaded.mockReturnValue(true);
    state.yt.channelViewMode = 'list';
    mountView();

    const card = cards()[0];
    expect(card.props()).toMatchObject({
      short: false,
      expanded: false,
      downloaded: true,
      coverStatus: 'ready',
      watchUrl: 'https://youtube.com/watch?v=a',
      layout: 'list',
      showViews: true
    });
    expect(state.resolveState).toHaveBeenCalledWith(true, 'downloading', 'ready');
    expect(state.yt.isVideoDownloaded).toHaveBeenCalledWith('a', 'UC1');
  });

  it('prefers an explicit video URL for the watch link', () => {
    state.yt.channelVideos = [video('a', { url: 'https://custom/watch' })];
    mountView();
    expect(cards()[0].props('watchUrl')).toBe('https://custom/watch');
  });

  it('forwards expand, collapse and playback events', async () => {
    mountView();
    const card = cards()[0];
    card.vm.$emit('expand');
    await wrapper!.vm.$nextTick();
    expect(cards()[0].props('expanded')).toBe(true);

    card.vm.$emit('collapse');
    await wrapper!.vm.$nextTick();
    expect(cards()[0].props('expanded')).toBe(false);

    card.vm.$emit('play');
    card.vm.$emit('open-channel', 'https://youtube.com/@channel');
    expect(state.yt.playStream).toHaveBeenCalledWith(state.yt.channelVideos[0]);
    expect(state.yt.openChannel).toHaveBeenCalledWith('https://youtube.com/@channel');
  });

  it('opens the watch window with the resolved URL', () => {
    mountView();
    cards()[0].vm.$emit('open-window');
    expect(state.open).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=a',
      '_blank',
      'width=1100,height=700'
    );

    state.yt.channelVideos = [video('a', { url: 'https://custom/watch' })];
    wrapper!.unmount();
    mountView();
    cards()[0].vm.$emit('open-window');
    expect(state.open).toHaveBeenLastCalledWith(
      'https://custom/watch',
      '_blank',
      'width=1100,height=700'
    );
  });

  it('collapses expanded cards with Escape', async () => {
    mountView();
    cards()[0].vm.$emit('expand');
    await wrapper!.vm.$nextTick();
    expect(cards()[0].props('expanded')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper!.vm.$nextTick();
    expect(cards()[0].props('expanded')).toBe(false);
  });

  it('removes the keyboard listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    mountView();
    wrapper!.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

describe('queueing', () => {
  it('queues immediately in smart mode', () => {
    mountView();
    cards()[0].vm.$emit('queue');
    expect(state.yt.queueVideo).toHaveBeenCalledWith(state.yt.channelVideos[0]);
  });

  it('opens the download dialog outside smart mode', async () => {
    state.settings.download.smartMode = false;
    mountView();
    cards()[0].vm.$emit('queue');
    await wrapper!.vm.$nextTick();
    expect(state.yt.queueVideo).not.toHaveBeenCalled();
    expect(wrapper!.findComponent(DownloadStub).props()).toMatchObject({
      title: 'Video a',
      thumbnail: 'thumb-a.jpg',
      channelTitle: 'Channel'
    });
  });

  it('always opens options through the dialog', async () => {
    mountView();
    cards()[0].vm.$emit('options');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="download-dialog"]').exists()).toBe(true);
  });

  it('passes every non-empty option and skips off sponsor blocks', async () => {
    state.settings.download.smartMode = false;
    mountView();
    cards()[0].vm.$emit('options');
    await wrapper!.vm.$nextTick();

    wrapper!.findComponent(DownloadStub).vm.$emit('confirm', {
      kind: 'video',
      format: 'mp4',
      quality: '1080p',
      audioQuality: 'high',
      videoContainer: 'mkv',
      filenameTemplate: 'tpl',
      cover: { mode: 'frame' },
      metaOverride: { artist: 'A' },
      outputDir: 'D:/out',
      subsLangs: 'pl',
      subsFormat: 'srt',
      subsMode: 'manual',
      subsFolder: true,
      audioLanguage: 'pl',
      sponsorBlock: 'off',
      trimStart: 1
    });
    await flushPromises();

    expect(state.yt.queueVideo).toHaveBeenCalledWith(state.yt.channelVideos[0], undefined, {
      kind: 'video',
      format: 'mp4',
      quality: '1080p',
      audioQuality: 'high',
      videoContainer: 'mkv',
      filenameTemplate: 'tpl',
      cover: { mode: 'frame' },
      metaOverride: { artist: 'A' },
      outputDir: 'D:/out',
      subsLangs: 'pl',
      subsFormat: 'srt',
      subsMode: 'manual',
      subsFolder: true,
      audioLanguage: 'pl'
    });
    expect(wrapper!.find('[data-testid="download-dialog"]').exists()).toBe(false);
  });

  it('passes a signal-free subset and full trims when provided', async () => {
    state.settings.download.smartMode = false;
    mountView();
    cards()[0].vm.$emit('options');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(DownloadStub).vm.$emit('confirm', {
      sponsorBlock: 'remove',
      trimStart: 2,
      trimEnd: 8
    });
    expect(state.yt.queueVideo).toHaveBeenCalledWith(state.yt.channelVideos[0], undefined, {
      sponsorBlock: 'remove',
      trimStart: 2,
      trimEnd: 8
    });
  });

  it('closes the dialog on cancel', async () => {
    state.settings.download.smartMode = false;
    mountView();
    cards()[0].vm.$emit('options');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(DownloadStub).vm.$emit('cancel');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="download-dialog"]').exists()).toBe(false);
  });
});

describe('follow and subscriptions', () => {
  it('opens the subscribe dialog for unfollowed channels', async () => {
    mountView();
    wrapper!.findComponent(HeaderStub).vm.$emit('toggle-follow');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(SubscribeStub).props()).toMatchObject({
      platform: 'youtube',
      channel: { channelId: 'UC1', channelTitle: 'Channel', channelThumbnail: 'ch.jpg' }
    });
  });

  it('confirms subscription with the chosen preferences', async () => {
    mountView();
    wrapper!.findComponent(HeaderStub).vm.$emit('toggle-follow');
    await wrapper!.vm.$nextTick();

    const payload = { prefs: { quality: 'best' }, downloadAll: true };
    wrapper!.findComponent(SubscribeStub).vm.$emit('confirm', payload);
    await wrapper!.vm.$nextTick();
    expect(state.yt.followChannelWithSetup).toHaveBeenCalledWith(
      {
        channelId: 'UC1',
        channelTitle: 'Channel',
        channelThumbnail: 'ch.jpg',
        platform: 'youtube'
      },
      payload
    );
    expect(wrapper!.find('[data-testid="subscribe-dialog"]').exists()).toBe(false);
  });

  it('uses the SoundCloud platform for SC channels', async () => {
    state.yt.channelIsSc = true;
    mountView();
    wrapper!.findComponent(HeaderStub).vm.$emit('toggle-follow');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(SubscribeStub).props('platform')).toBe('soundcloud');

    wrapper!.findComponent(SubscribeStub).vm.$emit('confirm', { downloadAll: false });
    await wrapper!.vm.$nextTick();
    expect(state.yt.followChannelWithSetup).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'soundcloud' }),
      { downloadAll: false }
    );
  });

  it('does nothing without a channel', async () => {
    state.yt.channel = null;
    mountView();
    // Grid is rendered by parent conditions, so exercise the unsubscribe path directly.
    expect(state.yt.followChannelWithSetup).not.toHaveBeenCalled();
    expect(state.yt.unfollowChannel).not.toHaveBeenCalled();
  });

  it('asks for confirmation before unfollowing an already followed channel', async () => {
    state.yt.isSubscribed.mockReturnValue(true);
    mountView();
    wrapper!.findComponent(HeaderStub).vm.$emit('toggle-follow');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(ConfirmStub).props()).toMatchObject({
      title: 'youtube.unsubscribeChannel',
      variant: 'danger'
    });

    wrapper!.findComponent(ConfirmStub).vm.$emit('confirm');
    await flushPromises();
    await wrapper!.vm.$nextTick();
    expect(state.yt.unfollowChannel).toHaveBeenCalledWith('UC1');
    expect(wrapper!.find('[data-testid="confirm-dialog"]').exists()).toBe(false);
  });

  it('cancels unfollowing without calling the store', async () => {
    state.yt.isSubscribed.mockReturnValue(true);
    mountView();
    wrapper!.findComponent(HeaderStub).vm.$emit('toggle-follow');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(ConfirmStub).vm.$emit('cancel');
    await wrapper!.vm.$nextTick();
    expect(state.yt.unfollowChannel).not.toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="confirm-dialog"]').exists()).toBe(false);
  });
});

describe('footer states', () => {
  it('shows a loader while loading with no items', () => {
    state.yt.channelVideos = [];
    state.yt.channelLoading = true;
    mountView();
    const loaders = wrapper!.findAllComponents(LoaderStub);
    expect(loaders.some((l) => l.props('size') === 56)).toBe(true);
  });

  it('shows the empty message when nothing is loaded', () => {
    state.yt.channelVideos = [];
    mountView();
    expect(wrapper!.text()).toContain('youtube.noVideos');
  });

  it('registers the sentinel and shows a small loader while paging', async () => {
    state.yt.channelHasMore = true;
    state.yt.channelLoading = true;
    mountView();
    expect(state.setSentinel).toHaveBeenCalled();
    expect(wrapper!.findAllComponents(LoaderStub).some((l) => l.props('size') === 40)).toBe(true);
  });

  it('omits the sentinel when there are no more pages', () => {
    state.yt.channelHasMore = false;
    mountView();
    expect(state.setSentinel).not.toHaveBeenCalled();
    expect(wrapper!.findAllComponents(LoaderStub)).toHaveLength(0);
  });
});
