import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  settings: null as any,
  updateNetwork: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => ({ network: mocks.settings, updateNetwork: mocks.updateNetwork })
}));

import SettingsNetwork from '../SettingsNetwork.vue';

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: ['title', 'description'],
  template: '<section><span class="group-title">{{ title }}</span><slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: ['label', 'description'],
  template: '<div class="row"><slot /></div>'
});
const TitleStub = defineComponent({
  name: 'SettingsSectionTitle',
  props: ['title'],
  template: '<span class="section-title">{{ title }}</span>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" @click="$emit(\'update:modelValue\', !modelValue)" />'
});

let wrapper: VueWrapper | null = null;

function mountNetwork() {
  wrapper = mount(SettingsNetwork, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsSectionTitle: TitleStub,
        SettingsToggle: ToggleStub
      }
    }
  });
  return wrapper;
}

function inputByLabel(label: string) {
  return wrapper!.get(`[aria-label="${label}"]`);
}

beforeEach(() => {
  mocks.updateNetwork.mockClear();
  mocks.settings = reactive({
    proxy: {
      enabled: false,
      type: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: 'user',
      password: 'pass'
    },
    downloadSpeedLimit: 0,
    userAgent: 'Onda/1.0'
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('proxy', () => {
  it('shows only the toggle while disabled', () => {
    mountNetwork();

    expect(wrapper!.find('[data-testid="toggle"]').exists()).toBe(true);
    expect(wrapper!.findAll('select')).toHaveLength(0);
    expect(wrapper!.text()).not.toContain('settings.proxyType');
  });

  it('toggles the proxy preserving the rest of the config', async () => {
    mountNetwork();

    await wrapper!.get('[data-testid="toggle"]').trigger('click');

    expect(mocks.updateNetwork).toHaveBeenCalledWith({
      proxy: {
        enabled: true,
        type: 'http',
        host: '127.0.0.1',
        port: 8080,
        username: 'user',
        password: 'pass'
      }
    });
  });

  it('exposes the proxy fields when enabled and selects the type', async () => {
    mocks.settings.proxy.enabled = true;
    mountNetwork();

    const types = wrapper!.findAll('button').filter((item) => item.text() === 'socks5');
    expect(types).toHaveLength(1);
    expect(
      wrapper!
        .findAll('button')
        .find((item) => item.text() === 'http')!
        .classes()
    ).toContain('bg-primary');

    await types[0].trigger('click');

    expect(mocks.updateNetwork).toHaveBeenLastCalledWith({
      proxy: expect.objectContaining({ type: 'socks5' })
    });
  });

  it('updates text and numeric proxy fields', async () => {
    mocks.settings.proxy.enabled = true;
    mountNetwork();

    const host = wrapper!.findAll('input')[0];
    const port = wrapper!.findAll('input')[1];
    const username = wrapper!.findAll('input')[2];
    const password = wrapper!.findAll('input')[3];

    await host.setValue('proxy.local');
    await port.setValue('3128');
    await username.setValue('alice');
    await password.setValue('secret');

    expect(mocks.updateNetwork).toHaveBeenCalledWith({
      proxy: expect.objectContaining({ host: 'proxy.local' })
    });
    expect(mocks.updateNetwork).toHaveBeenCalledWith({
      proxy: expect.objectContaining({ port: 3128 })
    });
    expect(mocks.updateNetwork).toHaveBeenCalledWith({
      proxy: expect.objectContaining({ username: 'alice' })
    });
    expect(mocks.updateNetwork).toHaveBeenCalledWith({
      proxy: expect.objectContaining({ password: 'secret' })
    });
  });

  it('coerces an invalid port to zero', async () => {
    mocks.settings.proxy.enabled = true;
    mountNetwork();

    await wrapper!.findAll('input')[1].setValue('abc');

    expect(mocks.updateNetwork).toHaveBeenCalledWith({
      proxy: expect.objectContaining({ port: 0 })
    });
  });
});

describe('speed limit', () => {
  it('labels the unlimited state and updates the slider', async () => {
    mountNetwork();

    expect(wrapper!.text()).toContain('settings.speedUnlimited');
    const slider = inputByLabel('settings.downloadSpeedLimit');
    expect(slider.attributes('max')).toBe('51200');

    await slider.setValue('2048');

    expect(mocks.updateNetwork).toHaveBeenCalledWith({ downloadSpeedLimit: 2048 });
  });

  it('formats a finite limit in MB/s', () => {
    mocks.settings.downloadSpeedLimit = 2048;
    mountNetwork();

    expect(wrapper!.text()).toContain('2.0 MB/s');
    expect(wrapper!.text()).not.toContain('settings.speedUnlimited: ');
  });
});

describe('user agent', () => {
  it('renders and updates the user agent', async () => {
    mountNetwork();
    const input = wrapper!.find('input[placeholder^="Mozilla"]');

    expect((input.element as HTMLInputElement).value).toBe('Onda/1.0');
    await input.setValue('Custom UA');

    expect(mocks.updateNetwork).toHaveBeenCalledWith({ userAgent: 'Custom UA' });
  });
});
