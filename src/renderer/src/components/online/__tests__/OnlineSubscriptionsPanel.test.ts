import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

const EmptyStub = defineComponent({
  name: 'EmptyState',
  props: {
    title: { type: String },
    description: { type: String },
    icon: { type: [Object, Function] },
    variant: { type: String }
  },
  emits: [],
  template: '<div data-testid="empty">{{ title }}<slot /></div>'
});
const LoaderStub = defineComponent({
  name: 'Loader',
  props: { overlay: { type: Boolean }, label: { type: String } },
  template: '<div data-testid="loader" />'
});
const ButtonStub = defineComponent({
  name: 'OnlineButton',
  emits: ['click'],
  template: '<button data-testid="discover" @click="$emit(\'click\')"><slot /></button>'
});
const CardStub = defineComponent({
  name: 'OnlineSubscriptionCard',
  props: {
    sub: { type: Object },
    loadingChannelId: { type: String },
    isQueuing: { type: Function }
  },
  emits: [
    'open-channel',
    'download-all',
    'check-now',
    'toggle-auto-download',
    'open-prefs',
    'unfollow'
  ],
  template: '<div data-testid="card" />'
});

import OnlineSubscriptionsPanel from '../OnlineSubscriptionsPanel.vue';

const subscriptions = [
  { channelId: 'c1', channelTitle: 'One' },
  { channelId: 'c2', channelTitle: 'Two' }
];

function mountPanel(over: Record<string, unknown> = {}) {
  return mount(OnlineSubscriptionsPanel, {
    props: {
      subscriptions: subscriptions as never,
      loaded: true,
      checkingChannelId: null,
      isQueuing: (id: string) => id === 'c1',
      ...over
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        EmptyState: EmptyStub,
        Loader: LoaderStub,
        Button: ButtonStub,
        OnlineSubscriptionCard: CardStub
      }
    }
  });
}

describe('OnlineSubscriptionsPanel', () => {
  it('shows a loader until subscriptions are loaded', () => {
    const wrapper = mountPanel({ loaded: false, subscriptions: [] });

    expect(wrapper.find('[data-testid="loader"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="card"]').exists()).toBe(false);
  });

  it('shows an empty state with a discover action', async () => {
    const wrapper = mountPanel({ subscriptions: [] });

    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true);
    expect(wrapper.findComponent(EmptyStub).props('title')).toBe('youtube.noSubscriptions');
    expect(wrapper.findComponent(EmptyStub).props('description')).toBe(
      'youtube.noSubscriptionsHint'
    );

    await wrapper.get('[data-testid="discover"]').trigger('click');
    expect(wrapper.emitted('discover')).toEqual([[]]);
  });

  it('renders a card per subscription with loading state', () => {
    const wrapper = mountPanel({ checkingChannelId: 'c2' });
    const cards = wrapper.findAllComponents(CardStub);

    expect(cards).toHaveLength(2);
    expect(cards[0].props()).toMatchObject({ sub: subscriptions[0], loadingChannelId: 'c2' });
    expect((cards[0].props('isQueuing') as (id: string) => boolean)('c1')).toBe(true);
  });

  it('forwards card events', () => {
    const wrapper = mountPanel();
    const card = wrapper.findComponent(CardStub);

    card.vm.$emit('open-channel', 'c1');
    card.vm.$emit('download-all', subscriptions[0]);
    card.vm.$emit('check-now', 'c1');
    card.vm.$emit('toggle-auto-download', 'c1', true);
    card.vm.$emit('open-prefs', subscriptions[0]);
    card.vm.$emit('unfollow', 'c1');

    expect(wrapper.emitted('openChannel')).toEqual([['c1']]);
    expect(wrapper.emitted('downloadAll')).toEqual([[subscriptions[0]]]);
    expect(wrapper.emitted('checkNow')).toEqual([['c1']]);
    expect(wrapper.emitted('toggleAutoDownload')).toEqual([['c1', true]]);
    expect(wrapper.emitted('openPrefs')).toEqual([[subscriptions[0]]]);
    expect(wrapper.emitted('unfollow')).toEqual([['c1']]);
  });
});
