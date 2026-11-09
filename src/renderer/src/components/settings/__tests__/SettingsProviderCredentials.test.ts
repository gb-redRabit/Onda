import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  notify: vi.fn(),
  providerLabel: vi.fn((_id: string, label: string) => `label:${label}`),
  invoke: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/utils/providerLabels', () => ({ providerLabel: state.providerLabel }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));

const GroupStub = defineComponent({
  name: 'SettingsGroupStub',
  props: { title: String, description: String },
  template: '<section><slot /></section>'
});
const IconStub = defineComponent({
  name: 'ProviderIconStub',
  props: { providerId: String, label: String, size: Number },
  template: '<span data-testid="provider-icon" />'
});
const InputStub = defineComponent({
  name: 'InputStub',
  props: { modelValue: String, placeholder: String, ariaLabel: String, type: String, size: String },
  emits: ['update:modelValue', 'keydown'],
  template: `<input
    :value="modelValue"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    @input="$emit('update:modelValue', $event.target.value)"
    @keydown="$emit('keydown', $event)"
  />`
});

import SettingsProviderCredentials from '../SettingsProviderCredentials.vue';

let wrapper: VueWrapper | null = null;

function rows() {
  return [
    { id: '115', label: '115', icon: 'cloud', hasCookie: true, required: true },
    { id: 'quark', label: 'Quark', icon: 'cloud', hasCookie: false, required: true },
    { id: 'gdrive', label: 'Drive', icon: 'drive', hasCookie: false, required: false }
  ];
}

function setup() {
  wrapper = mount(SettingsProviderCredentials, {
    global: {
      stubs: { SettingsGroup: GroupStub, ProviderIcon: IconStub, Input: InputStub }
    }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonByText(text: string) {
  return buttons().find((button) => button.text().includes(text))!;
}

function inputs() {
  return wrapper!.findAll('input');
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.t.mockClear();
  state.notify.mockReset();
  state.providerLabel.mockClear();
  state.invoke.mockReset();
  state.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'providers:auth:list') return rows();
    if (channel === 'providers:cred:set') return true;
    if (channel === 'providers:cred:login') return { success: true };
    return undefined;
  });
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('shows a loading placeholder first', () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    setup();

    expect(wrapper!.text()).toContain('common.loading');
    resolve(rows());
    return flush().then(() => {
      expect(wrapper!.text()).toContain('label:115');
    });
  });

  it('falls back to an empty list on failure', async () => {
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    setup();
    await flush();

    expect(wrapper!.text()).toContain('settings.providerCredentialsEmpty');
  });

  it('shows the empty message for no rows', async () => {
    state.invoke.mockResolvedValueOnce([]);
    setup();
    await flush();
    expect(wrapper!.text()).toContain('settings.providerCredentialsEmpty');
  });
});

describe('rows', () => {
  it('renders labels, states and icons', async () => {
    setup();
    await flush();

    expect(state.providerLabel).toHaveBeenCalledWith('115', '115', expect.any(Function));
    expect(wrapper!.findAll('[data-testid="provider-icon"]')).toHaveLength(3);
    expect(wrapper!.get('[data-testid="cred-state-115"]').text()).toBe('providers.cookieSet');
    expect(wrapper!.get('[data-testid="cred-state-quark"]').text()).toBe('providers.cookieMissing');
    expect(wrapper!.get('[data-testid="cred-state-gdrive"]').text()).toBe(
      'providers.credentialsOptional'
    );
  });

  it('colours the status dot', async () => {
    setup();
    await flush();
    const dots = wrapper!.findAll('.rounded-full').filter((dot) => dot.classes().includes('w-2'));

    expect(dots[0].classes()).toContain('bg-success');
    expect(dots[1].classes()).toContain('bg-warning');
    expect(dots[2].classes()).toContain('bg-base-300');
  });

  it('shows a clear button only for saved credentials', async () => {
    setup();
    await flush();

    expect(wrapper!.findAll('[data-testid="cred-state-115"]')).toHaveLength(1);
    expect(buttonByText('common.clear')).toBeTruthy();
    expect(buttons().filter((button) => button.text() === 'common.clear')).toHaveLength(1);
  });
});

describe('saving cookies', () => {
  it('ignores blank values', async () => {
    setup();
    await flush();
    state.invoke.mockClear();

    await buttonByText('providers.save').trigger('click');

    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('saves a trimmed cookie and reloads', async () => {
    setup();
    await flush();
    const input = inputs()[0];
    await input.setValue('  sid=abc  ');
    state.invoke.mockClear();

    await buttonByText('providers.save').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('providers:cred:set', {
      providerId: '115',
      cookie: 'sid=abc'
    });
    expect(state.invoke.mock.calls.filter(([ch]) => ch === 'providers:auth:list')).toHaveLength(1);
    await flush();
    expect((inputs()[0].element as HTMLInputElement).value).toBe('');
  });

  it('saves on Enter', async () => {
    setup();
    await flush();
    await inputs()[0].setValue('cookie');
    state.invoke.mockClear();

    await inputs()[0].trigger('keydown', { key: 'Enter' });
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('providers:cred:set', {
      providerId: '115',
      cookie: 'cookie'
    });
  });

  it('reports a rejected save', async () => {
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:auth:list') return rows();
      if (channel === 'providers:cred:set') return false;
      return undefined;
    });
    setup();
    await flush();
    await inputs()[0].setValue('cookie');

    await buttonByText('providers.save').trigger('click');
    await flush();

    expect(state.notify).toHaveBeenCalledWith(
      'error',
      'providers.save',
      'providers.cookieSaveFailed'
    );
  });

  it('disables actions while saving', async () => {
    let resolve!: (value: boolean) => void;
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:auth:list') return rows();
      if (channel === 'providers:cred:set')
        return new Promise<boolean>((res) => {
          resolve = res;
        });
      return undefined;
    });
    setup();
    await flush();
    await inputs()[0].setValue('cookie');

    const save = buttons().filter((button) => button.text() === 'providers.save')[0];
    await save.trigger('click');
    await flush();
    expect(save.attributes('disabled')).toBeDefined();
    expect(buttonByText('providers.login').attributes('disabled')).toBeDefined();

    resolve(true);
    await flush();
    expect(buttonByText('providers.login').attributes('disabled')).toBeUndefined();
  });
});

describe('clearing cookies', () => {
  it('clears and reloads', async () => {
    setup();
    await flush();
    state.invoke.mockClear();

    await buttonByText('common.clear').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('providers:cred:clear', '115');
    expect(state.invoke.mock.calls.filter(([ch]) => ch === 'providers:auth:list')).toHaveLength(1);
  });
});

describe('interactive login', () => {
  it('reloads and notifies on success', async () => {
    setup();
    await flush();
    state.invoke.mockClear();

    await buttonByText('providers.login').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('providers:cred:login', '115');
    expect(state.invoke.mock.calls.filter(([ch]) => ch === 'providers:auth:list')).toHaveLength(1);
    expect(state.notify).toHaveBeenCalledWith('success', 'providers.login', 'providers.cookieSet');
  });

  it('reports a login error', async () => {
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:auth:list') return rows();
      if (channel === 'providers:cred:login') return { success: false, error: 'blocked' };
      return undefined;
    });
    setup();
    await flush();

    await buttonByText('providers.login').trigger('click');
    await flush();

    expect(state.notify).toHaveBeenCalledWith('error', 'providers.login', 'blocked');
  });

  it('stays quiet for a cancelled login', async () => {
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'providers:auth:list') return rows();
      if (channel === 'providers:cred:login') return { success: false, canceled: true };
      return undefined;
    });
    setup();
    await flush();

    await buttonByText('providers.login').trigger('click');
    await flush();

    expect(state.notify).not.toHaveBeenCalled();
  });
});
