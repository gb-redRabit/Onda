import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  store: null as any,
  settings: null as any,
  updateDownload: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: mocks.t }) }));
vi.mock('@renderer/stores/providerSubs', () => ({ useProviderSubsStore: () => mocks.store }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => mocks.settings }));

import ProviderSubscriptionsPanel from '../ProviderSubscriptionsPanel.vue';

const SwitchStub = defineComponent({
  name: 'UiSwitch',
  props: ['modelValue', 'label', 'size'],
  emits: ['update:modelValue'],
  template: '<button data-testid="auto-check" @click="$emit(\'update:modelValue\', !modelValue)" />'
});
const ButtonStub = defineComponent({
  name: 'OnlineButton',
  emits: ['click'],
  template: '<button data-testid="check-all" @click="$emit(\'click\')"><slot /></button>'
});
const LoaderStub = defineComponent({
  name: 'Loader',
  props: ['label'],
  template: '<div data-testid="loader" />'
});
const EmptyStub = defineComponent({
  name: 'EmptyState',
  props: ['variant', 'icon', 'title'],
  template: '<div data-testid="empty">{{ title }}</div>'
});
const CardStub = defineComponent({
  name: 'ProviderSubscriptionCard',
  props: ['sub'],
  emits: ['open', 'check', 'remove', 'replace'],
  template: '<div data-testid="card" />'
});

let wrapper: VueWrapper | null = null;

function mountPanel() {
  wrapper = mount(ProviderSubscriptionsPanel, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        Switch: SwitchStub,
        OnlineButton: ButtonStub,
        Loader: LoaderStub,
        EmptyState: EmptyStub,
        ProviderSubscriptionCard: CardStub
      }
    }
  });
  return wrapper;
}

function subs() {
  return [
    { id: 's1', url: 'https://a/1', title: 'One' },
    { id: 's2', url: 'https://a/2', title: 'Two' }
  ];
}

beforeEach(() => {
  mocks.t.mockClear();
  mocks.updateDownload.mockClear();
  mocks.store = reactive({
    loaded: true,
    subs: subs(),
    load: vi.fn().mockResolvedValue(undefined),
    checkAll: vi.fn(),
    check: vi.fn(),
    remove: vi.fn(),
    replaceLink: vi.fn()
  });
  mocks.settings = reactive({
    download: { autoCheckLinkSubscriptions: false },
    updateDownload: mocks.updateDownload
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('loading and empty states', () => {
  it('loads subscriptions on mount when not loaded', () => {
    mocks.store.loaded = false;
    mountPanel();

    expect(mocks.store.load).toHaveBeenCalledTimes(1);
    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(false);
  });

  it('skips loading when the store is ready', () => {
    mountPanel();

    expect(mocks.store.load).not.toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(false);
  });

  it('shows the empty state without subscriptions', () => {
    mocks.store.subs = [];
    mountPanel();

    expect(wrapper!.get('[data-testid="empty"]').text()).toBe('providers.subsEmpty');
    expect(wrapper!.find('[data-testid="card"]').exists()).toBe(false);
  });

  it('renders a card per subscription', () => {
    mountPanel();

    const cards = wrapper!.findAllComponents(CardStub);
    expect(cards).toHaveLength(2);
    expect(cards[0].props('sub')).toMatchObject({ id: 's1' });
    expect(wrapper!.text()).toContain('providers.subsTitle');
  });
});

describe('auto check', () => {
  it('reflects the setting and updates it', async () => {
    mocks.settings.download.autoCheckLinkSubscriptions = true;
    mountPanel();

    expect(wrapper!.findComponent(SwitchStub).props('modelValue')).toBe(true);

    await wrapper!.get('[data-testid="auto-check"]').trigger('click');
    expect(mocks.updateDownload).toHaveBeenCalledWith({ autoCheckLinkSubscriptions: false });
  });

  it('reports the stored value', () => {
    mocks.settings.download.autoCheckLinkSubscriptions = false;
    mountPanel();

    expect(wrapper!.findComponent(SwitchStub).props('modelValue')).toBe(false);
    expect(wrapper!.text()).toContain('providers.autoCheck');
  });
});

describe('actions', () => {
  it('checks all subscriptions', async () => {
    mountPanel();

    await wrapper!.findComponent(ButtonStub).trigger('click');

    expect(mocks.store.checkAll).toHaveBeenCalledTimes(1);
    expect(wrapper!.text()).toContain('providers.checkAll');
  });

  it('forwards card events', () => {
    mountPanel();
    const cards = wrapper!.findAllComponents(CardStub);

    cards[0].vm.$emit('open');
    cards[0].vm.$emit('check');
    cards[0].vm.$emit('remove');
    cards[0].vm.$emit('replace', 'https://new/1');

    expect(wrapper!.emitted('open')).toEqual([['https://a/1']]);
    expect(mocks.store.check).toHaveBeenCalledWith('s1');
    expect(mocks.store.remove).toHaveBeenCalledWith('s1');
    expect(mocks.store.replaceLink).toHaveBeenCalledWith('s1', 'https://new/1');
  });
});
