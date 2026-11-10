import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  locale: null as any,
  providerLabel: vi.fn((id: string) => `label:${id}`),
  relativeTime: vi.fn(() => '5 min')
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: state.t, locale: state.locale })
}));
vi.mock('@renderer/utils/providerLabels', () => ({ providerLabel: state.providerLabel }));
vi.mock('@renderer/utils/relativeTime', () => ({ relativeTime: state.relativeTime }));

const ButtonStub = defineComponent({
  name: 'OnlineButtonStub',
  props: { variant: String, size: String, title: String },
  template: '<button :title="title"><slot /></button>'
});
const IconButtonStub = defineComponent({
  name: 'OnlineIconButtonStub',
  props: { disabled: Boolean, title: String, variant: String },
  template: '<button :disabled="disabled" :title="title"><slot /></button>'
});
const BadgeStub = defineComponent({
  name: 'OnlineBadgeStub',
  props: { variant: String, size: String },
  template: '<span data-testid="badge" :data-variant="variant"><slot /></span>'
});
const ProviderIconStub = defineComponent({
  name: 'ProviderIconStub',
  props: { providerId: String, label: String, size: Number },
  template: '<span data-testid="provider-icon" />'
});

import ProviderSubscriptionCard from '../ProviderSubscriptionCard.vue';

let wrapper: VueWrapper | null = null;

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    providerId: 'pikpak',
    title: 'My share',
    url: 'https://provider/share/1',
    status: 'ok',
    newCount: 0,
    lastCheckedAt: 0,
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(ProviderSubscriptionCard, {
    props: { sub: sub(), ...props },
    global: {
      stubs: {
        OnlineButton: ButtonStub,
        OnlineIconButton: IconButtonStub,
        OnlineBadge: BadgeStub,
        ProviderIcon: ProviderIconStub
      }
    }
  });
  return wrapper;
}

function badges() {
  return wrapper!.findAll('[data-testid="badge"]');
}

beforeEach(() => {
  state.t.mockClear();
  state.locale = ref('pl');
  state.providerLabel.mockClear();
  state.relativeTime.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('shows provider, title, url and status', () => {
    setup();

    expect(wrapper!.text()).toContain('My share');
    expect(wrapper!.text()).toContain('https://provider/share/1');
    expect(wrapper!.find('[data-testid="provider-icon"]').exists()).toBe(true);
    expect(state.providerLabel).toHaveBeenCalledWith('pikpak', 'pikpak', expect.any(Function));
    expect(badges()[0].attributes('data-variant')).toBe('default');
    expect(badges()[1].attributes('data-variant')).toBe('green');
    expect(badges()[1].text()).toBe('providers.statusOk');
  });

  it('maps expired and error statuses', () => {
    setup({ sub: sub({ status: 'expired' }) });
    expect(badges()[1].attributes('data-variant')).toBe('amber');
    expect(badges()[1].text()).toBe('providers.statusExpired');

    wrapper!.unmount();
    setup({ sub: sub({ status: 'error' }) });
    expect(badges()[1].attributes('data-variant')).toBe('red');
    expect(badges()[1].text()).toBe('providers.statusError');
  });

  it('shows new item counts', () => {
    setup({ sub: sub({ newCount: 3 }) });
    expect(badges()[2].attributes('data-variant')).toBe('amber');
    expect(badges()[2].text()).toContain('providers.newItems:{"count":3}');
  });

  it('formats the last check time', () => {
    setup({ sub: sub({ lastCheckedAt: 1_700_000_000 }) });
    expect(state.relativeTime).toHaveBeenCalledWith(1_700_000_000, 'pl');
    expect(wrapper!.text()).toContain('youtube.lastChecked 5 min');
  });

  it('shows a placeholder when never checked', () => {
    setup();
    expect(wrapper!.text()).toContain('youtube.notCheckedYet');
  });

  it('spins while checking', () => {
    setup({ checking: true });
    expect(wrapper!.find('.animate-spin').exists()).toBe(true);
    expect(wrapper!.get('[title="providers.check"]').attributes('disabled')).toBeDefined();
  });
});

describe('actions', () => {
  it('emits open from the icon, title and button', async () => {
    setup();
    const buttons = wrapper!.findAll('button');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await wrapper!.get('[title="providers.open"]').trigger('click');

    expect(wrapper!.emitted('open')).toHaveLength(3);
  });

  it('emits check and remove', async () => {
    setup();
    await wrapper!.get('[title="providers.check"]').trigger('click');
    await wrapper!.get('[title="common.delete"]').trigger('click');

    expect(wrapper!.emitted('check')).toHaveLength(1);
    expect(wrapper!.emitted('remove')).toHaveLength(1);
  });

  it('does not show replace controls for healthy links', () => {
    setup();
    expect(wrapper!.find('[data-testid="providers-replace"]').exists()).toBe(false);
  });
});

describe('replacing failed links', () => {
  it('saves a trimmed replacement URL', async () => {
    setup({ sub: sub({ status: 'error' }) });

    await wrapper!.get('[data-testid="providers-replace"]').trigger('click');
    const input = wrapper!.get('input[type="text"]');
    await input.setValue('  https://new/link  ');
    await wrapper!.get('input[type="text"]').trigger('keydown', { key: 'Enter' });

    expect(wrapper!.emitted('replace')).toEqual([['https://new/link']]);
    expect(wrapper!.find('input[type="text"]').exists()).toBe(false);
  });

  it('ignores blank replacements', async () => {
    setup({ sub: sub({ status: 'expired' }) });
    await wrapper!.get('[data-testid="providers-replace"]').trigger('click');
    await wrapper!.get('input[type="text"]').setValue('   ');

    await wrapper!.get('input[type="text"]').trigger('keydown', { key: 'Enter' });

    expect(wrapper!.emitted('replace')).toBeUndefined();
    expect(wrapper!.find('input[type="text"]').exists()).toBe(true);
  });

  it('cancels editing', async () => {
    setup({ sub: sub({ status: 'error' }) });
    await wrapper!.get('[data-testid="providers-replace"]').trigger('click');

    await wrapper!.get('[title="common.cancel"]').trigger('click');

    expect(wrapper!.find('input[type="text"]').exists()).toBe(false);
  });

  it('resets editing when the subscription changes', async () => {
    setup({ sub: sub({ status: 'error' }) });
    await wrapper!.get('[data-testid="providers-replace"]').trigger('click');
    await wrapper!.get('input[type="text"]').setValue('draft');

    await wrapper!.setProps({ sub: sub({ id: 's2', status: 'error' }) });

    expect(wrapper!.find('input[type="text"]').exists()).toBe(false);
  });
});
