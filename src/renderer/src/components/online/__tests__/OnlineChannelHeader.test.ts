import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  yt: null as any,
  formatNumber: vi.fn((n: number) => `num:${n}`),
  useRemoteImage: vi.fn()
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.yt }));
vi.mock('@renderer/utils/formatters', () => ({ formatNumber: h.formatNumber }));
vi.mock('@renderer/composables/useRemoteImage', () => ({ useRemoteImage: h.useRemoteImage }));

const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: { variant: { type: String }, size: { type: String } },
  emits: ['click'],
  template: '<button data-testid="button" @click="$emit(\'click\')"><slot /></button>'
});
const SegmentStub = defineComponent({
  name: 'OnlineSegmentControl',
  props: { modelValue: { type: String }, options: { type: Array } },
  emits: ['update:modelValue'],
  template: '<div data-testid="segment" />'
});

import OnlineChannelHeader from '../OnlineChannelHeader.vue';

function channel(over: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    title: 'Channel',
    thumbnail: 'thumb.png',
    bannerUrl: 'banner.png',
    subscriberCount: 1200,
    videoCount: 42,
    description: 'About',
    ...over
  };
}

function mountHeader(over: { channel?: unknown; isSc?: boolean; subscribed?: boolean } = {}) {
  h.yt = reactive({
    channel: over.channel === undefined ? channel() : over.channel,
    channelIsSc: over.isSc ?? false,
    channelViewMode: 'grid',
    isSubscribed: vi.fn(() => over.subscribed ?? false),
    closeChannel: vi.fn()
  });
  return mount(OnlineChannelHeader, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { OnlineButton: ButtonStub, OnlineSegmentControl: SegmentStub }
    }
  });
}

beforeEach(() => {
  h.formatNumber.mockClear();
  h.useRemoteImage
    .mockReset()
    .mockImplementation((source) =>
      computed(() => (source.value ? `img:${source.value}` : undefined))
    );
});

describe('OnlineChannelHeader', () => {
  it('renders nothing without a channel', () => {
    h.yt = reactive({
      channel: null,
      isSubscribed: vi.fn(),
      channelIsSc: false,
      channelViewMode: 'grid',
      closeChannel: vi.fn()
    });
    const wrapper = mount(OnlineChannelHeader, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { OnlineButton: ButtonStub, OnlineSegmentControl: SegmentStub }
      }
    });

    expect(wrapper.find('[data-testid="online-channel-header"]').exists()).toBe(false);
  });

  it('renders the banner, avatar and counts', () => {
    const wrapper = mountHeader();
    const text = wrapper.text();

    expect(wrapper.find('[data-testid="online-channel-header"]').exists()).toBe(true);
    expect(wrapper.get('img').attributes('src')).toBe('img:thumb.png');
    expect(text).toContain('Channel');
    expect(text).toContain('num:1200');
    expect(text).toContain('youtube.subscribers');
    expect(text).toContain('num:42');
    expect(text).toContain('youtube.videos');
    expect(text).toContain('About');
  });

  it('uses SoundCloud labels', () => {
    const text = mountHeader({ isSc: true }).text();

    expect(text).toContain('youtube.followers');
    expect(text).toContain('youtube.tracks');
  });

  it('falls back to a gradient banner without a banner url', () => {
    const wrapper = mountHeader({ channel: channel({ bannerUrl: undefined }) });

    expect(wrapper.find('.bg-cover').exists()).toBe(false);
  });

  it('falls back to an avatar placeholder after an image error', async () => {
    const wrapper = mountHeader();
    const img = wrapper.get('img');

    await img.trigger('error');

    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('resets the avatar failure when the channel changes', async () => {
    const wrapper = mountHeader();
    await wrapper.get('img').trigger('error');

    h.yt.channel = channel({ id: 'ch-2', thumbnail: 'next.png' });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(true);
  });

  it('invites following and emits the toggle', async () => {
    const wrapper = mountHeader();
    const button = wrapper.findAllComponents(ButtonStub)[0];

    expect(button.props('variant')).toBe('primary');
    expect(button.text()).toContain('youtube.subscribeChannel');

    await button.trigger('click');
    expect(wrapper.emitted('toggleFollow')).toEqual([[]]);
  });

  it('shows the unsubscribe state', () => {
    const button = mountHeader({ subscribed: true }).findAllComponents(ButtonStub)[0];

    expect(button.props('variant')).toBe('secondary');
    expect(button.text()).toContain('youtube.unsubscribeChannel');
  });

  it('closes the channel', async () => {
    const wrapper = mountHeader();

    await wrapper.findAllComponents(ButtonStub)[1].trigger('click');

    expect(h.yt.closeChannel).toHaveBeenCalledTimes(1);
  });

  it('offers grid and list view modes', () => {
    const wrapper = mountHeader();
    const segment = wrapper.getComponent(SegmentStub);
    const options = segment.props('options') as { value: string; label: string }[];

    expect(options.map((o) => o.value)).toEqual(['grid', 'list']);
    expect(options.map((o) => o.label)).toEqual(['youtube.viewTiles', 'youtube.viewList']);
    expect(segment.props('modelValue')).toBe('grid');
  });

  it('updates the channel view mode', () => {
    const wrapper = mountHeader();
    const segment = wrapper.getComponent(SegmentStub);

    segment.vm.$emit('update:modelValue', 'list');

    expect(h.yt.channelViewMode).toBe('list');
  });

  it('omits optional metadata', () => {
    const wrapper = mountHeader({
      channel: channel({
        subscriberCount: undefined,
        videoCount: undefined,
        description: undefined
      })
    });

    expect(wrapper.text()).not.toContain('youtube.subscribers');
    expect(wrapper.text()).not.toContain('youtube.videos');
    expect(wrapper.find('.line-clamp-3').exists()).toBe(false);
  });
});
