import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  isTrackSaved: vi.fn(),
  toggleTrack: vi.fn(),
  ensureLoaded: vi.fn(),
  notify: vi.fn(),
  loggerInfo: vi.fn(),
  detectPlatform: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/saved', () => ({
  useSavedStore: () => ({
    isTrackSaved: h.isTrackSaved,
    toggleTrack: h.toggleTrack,
    ensureLoaded: h.ensureLoaded
  })
}));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('@shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
vi.mock('@shared/platform', () => ({ detectPlatform: h.detectPlatform }));

const IconButtonStub = defineComponent({
  name: 'OnlineIconButton',
  props: ['title', 'variant', 'size'],
  emits: ['click'],
  template: '<button :aria-label="title" @click="$emit(\'click\', $event)"><slot /></button>'
});

import OnlineMediaThumb from '../OnlineMediaThumb.vue';

let wrapper: VueWrapper | null = null;

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    title: 'Video',
    url: 'https://youtube.com/watch?v=v1',
    thumbnail: 'https://img/v1.jpg',
    duration: '3:20',
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineMediaThumb, {
    props: { video: video(), ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { OnlineIconButton: IconButtonStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  h.t.mockClear();
  h.isTrackSaved.mockReset();
  h.isTrackSaved.mockReturnValue(false);
  h.toggleTrack.mockReset();
  h.toggleTrack.mockResolvedValue(true);
  h.ensureLoaded.mockReset();
  h.ensureLoaded.mockResolvedValue(undefined);
  h.notify.mockReset();
  h.loggerInfo.mockReset();
  h.detectPlatform.mockReset();
  h.detectPlatform.mockReturnValue({ platform: 'youtube' });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('rendering', () => {
  it('renders the thumbnail and duration', () => {
    setup();

    expect(wrapper!.get('img').attributes('src')).toBe('https://img/v1.jpg');
    expect(wrapper!.get('img').attributes('alt')).toBe('Video');
    expect(wrapper!.text()).toContain('3:20');
    expect(h.ensureLoaded).toHaveBeenCalled();
  });

  it('omits the image without a thumbnail', () => {
    setup({ video: video({ thumbnail: '' }) });
    expect(wrapper!.find('img').exists()).toBe(false);
  });

  it('shows the downloaded badge unless a cover is being fetched', async () => {
    setup({ downloaded: true });
    expect(wrapper!.find('.bg-success').exists()).toBe(true);

    await wrapper!.setProps({ coverStatus: 'fetching' });
    expect(wrapper!.find('.bg-success').exists()).toBe(false);
    expect(wrapper!.find('.animate-spin').exists()).toBe(true);
  });

  it('renders platform tags', async () => {
    setup({ platformTag: 'SC' });
    const tag = wrapper!.findAll('span').find((node) => node.text() === 'SC')!;
    expect(tag.classes()).toContain('text-warning');

    await wrapper!.setProps({ platformTag: 'YT' });
    const other = wrapper!.findAll('span').find((node) => node.text() === 'YT')!;
    expect(other.classes()).toContain('text-error');
  });

  it('applies the list layout class and hides quick actions', () => {
    setup({ layout: 'list' });

    expect(wrapper!.get('.relative').classes()).toContain('w-40');
    expect(wrapper!.find('[data-testid="online-quick-queue"]').exists()).toBe(false);
  });

  it('hides quick actions when requested', () => {
    setup({ hideQuickActions: true });
    expect(wrapper!.find('[data-testid="online-quick-queue"]').exists()).toBe(false);
  });
});

describe('stream actions', () => {
  it('emits play and logs the click', async () => {
    setup();
    const play = wrapper!
      .findAll('button')
      .find((button) => button.attributes('title') === 'youtube.playStream')!;

    await play.trigger('click');

    expect(h.loggerInfo).toHaveBeenCalledWith('yt', 'playStream click video=v1');
    expect(wrapper!.emitted('play')).toEqual([[expect.objectContaining({ id: 'v1' })]]);
  });

  it('emits expand for YouTube videos only', async () => {
    setup();
    const expand = () =>
      wrapper!
        .findAll('button')
        .find((button) => button.attributes('title') === 'youtube.playOnYoutube');

    await expand()!.trigger('click');
    expect(wrapper!.emitted('expand')).toHaveLength(1);

    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    await wrapper!.setProps({ video: video({ id: 'sc1' }) });
    expect(expand()).toBeUndefined();
    expect(wrapper!.emitted('expand')).toHaveLength(1);
  });

  it('hides the YouTube split and expand for SoundCloud and generic links', async () => {
    h.detectPlatform.mockReturnValue({ platform: 'soundcloud' });
    setup();
    expect(wrapper!.find('.w-px').exists()).toBe(false);
    expect(
      wrapper!.findAll('button').some((b) => b.attributes('title') === 'youtube.playOnYoutube')
    ).toBe(false);

    h.detectPlatform.mockReturnValue(null);
    await wrapper!.setProps({ video: video({ url: 'https://example.com/a', id: 'g1' }) });
    expect(wrapper!.find('.w-px').exists()).toBe(false);
  });

  it('marks unplayable videos and blocks expansion', () => {
    setup({ video: video({ isPlayable: false }) });
    expect(wrapper!.get('.absolute.inset-0.z-10').classes()).toContain('opacity-50');

    expect(
      wrapper!
        .findAll('button')
        .some((button) => button.attributes('title') === 'youtube.playOnYoutube')
    ).toBe(false);
    expect(wrapper!.emitted('expand')).toBeUndefined();
  });
});

describe('download actions', () => {
  it('queues and opens options without bubbling', async () => {
    setup();
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await wrapper!.get('[data-testid="online-quick-queue"]').trigger('click');
    const options = wrapper!
      .findAll('button')
      .find((button) => button.attributes('title') === 'youtube.downloadOptions')!;
    await options.trigger('click');

    expect(stop).toHaveBeenCalled();
    expect(wrapper!.emitted('queue')).toHaveLength(1);
    expect(wrapper!.emitted('options')).toHaveLength(1);
  });

  it('reflects queue/download state and disables the button', async () => {
    setup({ state: 'queuing' });
    const queue = () => wrapper!.get('[data-testid="online-quick-queue"]');

    expect(queue().attributes('disabled')).toBeDefined();
    expect(queue().find('.animate-spin').exists()).toBe(true);

    await wrapper!.setProps({ state: 'downloading' });
    expect(queue().find('.animate-spin').exists()).toBe(true);

    await wrapper!.setProps({ state: 'done' });
    expect(queue().find('.animate-spin').exists()).toBe(false);
    expect(queue().attributes('disabled')).toBeDefined();

    await wrapper!.setProps({ state: null });
    expect(queue().attributes('disabled')).toBeUndefined();
  });

  it('toggles saved state and notifies on success', async () => {
    setup();
    const save = wrapper!.get('[aria-label="saved.saveTrack"]');

    await save.trigger('click');
    await flush();

    expect(h.toggleTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
    expect(h.notify).toHaveBeenCalledWith('success', 'Video', 'saved.trackSaved');
  });

  it('skips the toast when saving fails', async () => {
    h.toggleTrack.mockResolvedValueOnce(false);
    setup();

    await wrapper!.get('[aria-label="saved.saveTrack"]').trigger('click');
    await flush();

    expect(h.notify).not.toHaveBeenCalled();
  });

  it('labels the save button from the saved state', () => {
    h.isTrackSaved.mockReturnValue(true);
    setup();

    expect(wrapper!.findComponent(IconButtonStub).props('title')).toBe('saved.removeTrack');
  });
});
