import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import OnlineMediaCard from '../OnlineMediaCard.vue';

const state = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  detectPlatform: vi.fn(),
  buildWatchUrl: vi.fn((id: string) => `https://youtube.com/watch?v=${id}`),
  formatNumber: vi.fn((value: number) => `${value}K`),
  stripUrls: vi.fn((value: string) => value.replace(/https?:\/\/\S+/g, '').trim()),
  prefetchStream: vi.fn(),
  observeIntersection: vi.fn(),
  observeCallback: null as ((isIntersecting: boolean) => void) | null,
  stopObserve: vi.fn(),
  channelTarget: 'https://youtube.com/@channel' as string | null,
  channelPageUrl: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
vi.mock('@shared/platform', () => ({ detectPlatform: state.detectPlatform }));
vi.mock('@shared/provider', () => ({ buildYouTubeWatchUrl: state.buildWatchUrl }));
vi.mock('@renderer/utils/formatters', () => ({ formatNumber: state.formatNumber }));
vi.mock('@renderer/utils/stripUrls', () => ({ stripUrls: state.stripUrls }));
vi.mock('@renderer/stores/online', () => ({
  useOnlineStore: () => ({ prefetchStream: state.prefetchStream })
}));
vi.mock('@renderer/utils/sharedIntersection', () => ({
  observeIntersection: state.observeIntersection
}));
vi.mock('@renderer/utils/onlineHelpers', () => ({
  channelPageUrl: state.channelPageUrl
}));

const EmbedStub = defineComponent({
  name: 'YtEmbedPlayer',
  props: {
    videoId: String,
    title: String,
    channelTitle: String,
    sourceUrl: String
  },
  emits: ['close', 'open-window'],
  template: `<div data-testid="embed">
    <button data-testid="embed-close" @click="$emit('close')" />
    <button data-testid="embed-open" @click="$emit('open-window')" />
  </div>`
});

const ThumbStub = defineComponent({
  name: 'OnlineMediaThumb',
  props: {
    video: Object,
    layout: String,
    short: Boolean,
    downloaded: Boolean,
    coverStatus: String,
    platformTag: String,
    hideQuickActions: Boolean,
    state: String
  },
  emits: ['play', 'expand', 'queue', 'options'],
  template: `<div data-testid="thumb">
    <button data-testid="thumb-play" @click="$emit('play', video)" />
    <button data-testid="thumb-expand" @click="$emit('expand', video)" />
    <button data-testid="thumb-queue" @click="$emit('queue', video)" />
    <button data-testid="thumb-options" @click="$emit('options', video)" />
  </div>`
});

const IconButtonStub = defineComponent({
  name: 'OnlineIconButton',
  props: { title: String, disabled: Boolean },
  template: `<button type="button" :disabled="disabled" :data-title="title"><slot /></button>`
});

const stubs = {
  YtEmbedPlayer: EmbedStub,
  OnlineMediaThumb: ThumbStub,
  OnlineIconButton: IconButtonStub
};

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vid-1',
    title: 'A video',
    channelTitle: 'A channel',
    channelId: 'UC12345678901234567890',
    url: 'https://www.youtube.com/watch?v=vid-1',
    description: 'about https://spam.example',
    viewCount: 1200,
    ...overrides
  };
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineMediaCard, {
    props: { video: video(), ...props } as never,
    global: { stubs, mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function listButton(title: string) {
  return wrapper!
    .findAllComponents(IconButtonStub)
    .find((button) => button.props('title') === title)!;
}

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  state.loggerInfo.mockReset();
  state.detectPlatform.mockReset();
  state.detectPlatform.mockReturnValue({ platform: 'youtube' });
  state.buildWatchUrl.mockClear();
  state.formatNumber.mockClear();
  state.stripUrls.mockClear();
  state.prefetchStream.mockReset();
  state.stopObserve.mockReset();
  state.channelTarget = 'https://youtube.com/@channel';
  state.channelPageUrl.mockReset();
  state.channelPageUrl.mockImplementation(() => state.channelTarget);
  state.observeIntersection.mockReset();
  state.observeCallback = null;
  state.observeIntersection.mockImplementation(
    (_el: Element, callback: (isIntersecting: boolean) => void, _margin: string) => {
      state.observeCallback = callback;
      return state.stopObserve;
    }
  );
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('card layout', () => {
  it('renders the thumbnail, title and channel', () => {
    setup();

    expect(wrapper!.find('[data-testid="thumb"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="embed"]').exists()).toBe(false);
    expect(wrapper!.text()).toContain('A video');
    expect(wrapper!.text()).toContain('A channel');
    expect(wrapper!.get('[data-testid="online-media-card"]').classes()).toContain('cv-card');
  });

  it('renders a plain channel label when no target exists', () => {
    state.channelTarget = null;
    setup();

    const channelButtons = wrapper!
      .findAll('button')
      .filter((button) => button.text() === 'A channel');
    expect(channelButtons).toHaveLength(0);
    expect(wrapper!.text()).toContain('A channel');
  });

  it('opens the channel page from the channel button', async () => {
    setup();
    const channel = wrapper!.findAll('button').find((button) => button.text() === 'A channel')!;
    await channel.trigger('click');

    expect(wrapper!.emitted('openChannel')).toEqual([['https://youtube.com/@channel']]);
  });

  it('formats views and strips URLs in the description', () => {
    state.detectPlatform.mockReturnValue({ platform: 'youtube' });
    setup({ showViews: true, showDescription: true });

    expect(wrapper!.text()).toContain('1200K');
    expect(wrapper!.text()).toContain('youtube.views');
    expect(wrapper!.text()).toContain('about');
    expect(wrapper!.text()).not.toContain('spam.example');
    expect(state.stripUrls).toHaveBeenCalledWith('about https://spam.example');
  });

  it('forwards thumbnail events', async () => {
    setup();
    const thumb = wrapper!.get('[data-testid="thumb"]');

    await thumb.get('[data-testid="thumb-play"]').trigger('click');
    await thumb.get('[data-testid="thumb-expand"]').trigger('click');
    await thumb.get('[data-testid="thumb-queue"]').trigger('click');
    await thumb.get('[data-testid="thumb-options"]').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(wrapper!.emitted('expand')).toHaveLength(1);
    expect(wrapper!.emitted('queue')).toHaveLength(1);
    expect(wrapper!.emitted('options')).toHaveLength(1);
  });

  it('passes presentation props to the thumbnail', () => {
    setup({
      layout: 'grid',
      short: true,
      downloaded: true,
      coverStatus: 'saved',
      platformTag: 'YT',
      hideQuickActions: true,
      state: 'done'
    });

    const thumb = wrapper!.getComponent(ThumbStub);
    expect(thumb.props()).toMatchObject({
      layout: 'grid',
      short: true,
      downloaded: true,
      coverStatus: 'saved',
      platformTag: 'YT',
      hideQuickActions: true,
      state: 'done'
    });
  });
});

describe('selection', () => {
  it('is hidden unless selectable', () => {
    setup();
    expect(wrapper!.find('[aria-label="common.select"]').exists()).toBe(false);
  });

  it('emits the selected id and reflects the state', async () => {
    setup({ selectable: true, selected: true });
    const button = wrapper!.get('[aria-label="common.select"]');

    expect(button.attributes('aria-pressed')).toBe('true');
    await button.trigger('click');
    expect(wrapper!.emitted('toggleSelect')).toEqual([['vid-1']]);
  });

  it('shows an unchecked state', () => {
    setup({ selectable: true });
    expect(wrapper!.get('[aria-label="common.select"]').attributes('aria-pressed')).toBe('false');
  });
});

describe('embed expansion', () => {
  it('replaces the card with the player when expanded', () => {
    setup({ expanded: true, watchUrl: 'https://custom/watch' });

    expect(wrapper!.find('[data-testid="embed"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="thumb"]').exists()).toBe(false);
    expect(wrapper!.getComponent(EmbedStub).props()).toMatchObject({
      videoId: 'vid-1',
      title: 'A video',
      channelTitle: 'A channel',
      sourceUrl: 'https://custom/watch'
    });
  });

  it('falls back to the generated watch URL', () => {
    setup({ expanded: true });

    expect(state.buildWatchUrl).toHaveBeenCalledWith('vid-1');
    expect(wrapper!.getComponent(EmbedStub).props('sourceUrl')).toBe(
      'https://youtube.com/watch?v=vid-1'
    );
  });

  it('emits collapse and open-window from the player', async () => {
    setup({ expanded: true });

    await wrapper!.get('[data-testid="embed-close"]').trigger('click');
    await wrapper!.get('[data-testid="embed-open"]').trigger('click');

    expect(wrapper!.emitted('collapse')).toHaveLength(1);
    expect(wrapper!.emitted('openWindow')).toEqual([['https://youtube.com/watch?v=vid-1']]);
  });

  it('keeps SoundCloud and generic items out of the embed', () => {
    state.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    setup({ expanded: true });
    expect(wrapper!.find('[data-testid="embed"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="thumb"]').exists()).toBe(true);

    wrapper!.unmount();
    state.detectPlatform.mockReturnValue(null);
    setup({ expanded: true });
    expect(wrapper!.find('[data-testid="embed"]').exists()).toBe(false);
  });
});

describe('list actions', () => {
  it('plays SoundCloud streams directly', async () => {
    state.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    setup({ layout: 'list' });

    await listButton('youtube.play').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(wrapper!.emitted('expand')).toBeUndefined();
    expect(state.loggerInfo).toHaveBeenCalledWith('yt', 'playStream click video=vid-1');
  });

  it('expands playable YouTube items', async () => {
    setup({ layout: 'list' });

    await listButton('youtube.play').trigger('click');

    expect(wrapper!.emitted('expand')).toHaveLength(1);
    expect(wrapper!.emitted('play')).toBeUndefined();
  });

  it('ignores unplayable items', async () => {
    setup({ layout: 'list', video: video({ isPlayable: false }) });

    await listButton('youtube.play').trigger('click');

    expect(wrapper!.emitted('expand')).toBeUndefined();
    expect(wrapper!.emitted('play')).toBeUndefined();
  });

  it('queues, opens options and opens the watch window', async () => {
    setup({ layout: 'list', watchUrl: 'https://custom/watch' });

    await listButton('youtube.addToQueue').trigger('click');
    await listButton('youtube.downloadOptions').trigger('click');
    await listButton('youtube.openInWindow').trigger('click');

    expect(wrapper!.emitted('queue')).toHaveLength(1);
    expect(wrapper!.emitted('options')).toHaveLength(1);
    expect(wrapper!.emitted('openWindow')).toEqual([['https://custom/watch']]);
  });

  it('stops propagation on inline actions', async () => {
    setup({ layout: 'list', selectable: true });
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await listButton('youtube.addToQueue').trigger('click');
    await wrapper!.get('[aria-label="common.select"]').trigger('click');

    expect(stop).toHaveBeenCalled();
  });

  it('disables queueing while a download is running', () => {
    setup({ layout: 'list', state: 'downloading' });
    expect(listButton('youtube.addToQueue').props('disabled')).toBe(true);

    wrapper!.unmount();
    setup({ layout: 'list', state: 'done' });
    expect(listButton('youtube.addToQueue').props('disabled')).toBe(true);
  });

  it('shows a spinner while queuing', () => {
    setup({ layout: 'list', state: 'queuing' });
    expect(wrapper!.find('.animate-spin').exists()).toBe(true);
  });

  it('hides list actions outside list layout', () => {
    setup();
    expect(wrapper!.findAllComponents(IconButtonStub)).toHaveLength(0);
  });
});

describe('prefetch', () => {
  it('observes the card and prefetches after a short delay', () => {
    vi.useFakeTimers();
    setup();

    expect(state.observeIntersection).toHaveBeenCalledWith(
      wrapper!.get('[data-testid="online-media-card"]').element,
      expect.any(Function),
      '300px'
    );

    state.observeCallback!(true);
    expect(state.stopObserve).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(599);
    expect(state.prefetchStream).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(state.prefetchStream).toHaveBeenCalledWith(expect.objectContaining({ id: 'vid-1' }));
  });

  it('ignores non-intersecting entries', () => {
    vi.useFakeTimers();
    setup();

    state.observeCallback!(false);
    vi.advanceTimersByTime(1000);

    expect(state.stopObserve).not.toHaveBeenCalled();
    expect(state.prefetchStream).not.toHaveBeenCalled();
  });

  it('prefetches on hover with a debounce', () => {
    vi.useFakeTimers();
    setup();
    const root = wrapper!.get('[data-testid="online-media-card"]');

    root.trigger('mouseenter');
    vi.advanceTimersByTime(199);
    expect(state.prefetchStream).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(state.prefetchStream).toHaveBeenCalledTimes(1);
  });

  it('skips prefetching for unplayable items', () => {
    vi.useFakeTimers();
    setup({ video: video({ isPlayable: false }) });

    expect(state.observeIntersection).not.toHaveBeenCalled();
    wrapper!.get('[data-testid="online-media-card"]').trigger('mouseenter');
    vi.advanceTimersByTime(1000);
    expect(state.prefetchStream).not.toHaveBeenCalled();
  });

  it('cancels pending hover work on unmount', () => {
    vi.useFakeTimers();
    setup();
    wrapper!.get('[data-testid="online-media-card"]').trigger('mouseenter');

    wrapper!.unmount();
    wrapper = null;
    vi.advanceTimersByTime(1000);

    expect(state.prefetchStream).not.toHaveBeenCalled();
    expect(state.stopObserve).toHaveBeenCalledTimes(1);
  });
});
