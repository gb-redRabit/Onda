import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed, reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  useRemoteImage: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/composables/useRemoteImage', () => ({ useRemoteImage: h.useRemoteImage }));

import SubscribeChannelCard from '../SubscribeChannelCard.vue';

function mountCard(over: Record<string, unknown> = {}) {
  return mount(SubscribeChannelCard, {
    props: {
      channel: { channelId: 'ch-1', channelTitle: 'Channel', channelThumbnail: 'thumb.png' },
      isSc: false,
      isEdit: false,
      ...over
    }
  });
}

beforeEach(() => {
  h.t.mockClear();
  h.useRemoteImage
    .mockReset()
    .mockImplementation((source) =>
      computed(() => (source.value ? `img:${source.value}` : undefined))
    );
});

describe('SubscribeChannelCard', () => {
  it('renders the avatar and title', () => {
    const wrapper = mountCard();

    expect(wrapper.get('img').attributes('src')).toBe('img:thumb.png');
    expect(wrapper.get('img').attributes('alt')).toBe('Channel');
    expect(wrapper.text()).toContain('Channel');
  });

  it('shows the SoundCloud hint', () => {
    const text = mountCard({ isSc: true }).text();

    expect(text).toContain('youtube.subscribeConfigHintSc');
  });

  it('shows the edit hint for an existing subscription', () => {
    const text = mountCard({ isEdit: true }).text();

    expect(text).toContain('youtube.prefSectionHint');
  });

  it('shows the new subscription hint otherwise', () => {
    expect(mountCard().text()).toContain('youtube.subscribeConfigHint');
  });

  it('falls back to a placeholder without a thumbnail', () => {
    const wrapper = mountCard({
      channel: { channelId: 'ch-1', channelTitle: 'Channel' }
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('falls back after an image error', async () => {
    const wrapper = mountCard();

    await wrapper.get('img').trigger('error');

    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('resets the failure for a new channel', async () => {
    const channel = reactive({
      channelId: 'ch-1',
      channelTitle: 'Channel',
      channelThumbnail: 'thumb.png'
    });
    const wrapper = mountCard({ channel });
    await wrapper.get('img').trigger('error');

    channel.channelId = 'ch-2';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img').exists()).toBe(true);
  });
});
