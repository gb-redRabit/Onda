import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  getAppInfo: vi.fn(),
  getLicenses: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { warn: h.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import SettingsAbout from '../SettingsAbout.vue';

const GroupStub = { props: ['title', 'description'], template: '<div><slot /></div>' };

let wrapper: VueWrapper | null = null;
let originalApi: Window['api'];

function mountAbout() {
  wrapper = mount(SettingsAbout, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  originalApi = window.api;
  window.api = {
    ...originalApi,
    getAppInfo: h.getAppInfo,
    getLicenses: h.getLicenses
  } as Window['api'];
  h.loggerWarn.mockClear();
  h.getAppInfo.mockReset().mockResolvedValue({ appName: 'Onda', appVersion: '1.2.3' });
  h.getLicenses.mockReset().mockResolvedValue([
    { name: 'vue', version: '3.5.0', license: 'MIT' },
    { name: 'electron', version: '40.0.0' }
  ]);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  window.api = originalApi;
});

describe('application info', () => {
  it('renders the app name, version and licenses', async () => {
    mountAbout();
    await flushPromises();

    expect(h.getAppInfo).toHaveBeenCalledTimes(1);
    expect(h.getLicenses).toHaveBeenCalledTimes(1);
    expect(wrapper!.text()).toContain('Onda');
    expect(wrapper!.text()).toContain('v1.2.3');
    expect(wrapper!.text()).toContain('vue@3.5.0');
    expect(wrapper!.text()).toContain('MIT');
    expect(wrapper!.text()).toContain('electron@40.0.0');
    expect(wrapper!.text()).toContain('settings.licenseUnknown');
  });

  it('falls back to the product name and empty version', async () => {
    h.getAppInfo.mockResolvedValue({});
    h.getLicenses.mockResolvedValue([]);

    mountAbout();
    await flushPromises();

    expect(wrapper!.text()).toContain('Onda');
    expect(wrapper!.text()).toContain('v');
    expect(wrapper!.text()).not.toContain('@');
  });

  it('keeps the defaults when info is missing', async () => {
    h.getAppInfo.mockResolvedValue(null);
    h.getLicenses.mockResolvedValue(null);

    mountAbout();
    await flushPromises();

    expect(wrapper!.text()).toContain('Onda');
    expect(wrapper!.text()).toContain('settings.licenseUnknown');
  });

  it('logs load failures without breaking the view', async () => {
    h.getAppInfo.mockRejectedValue(new Error('ipc'));
    h.getLicenses.mockResolvedValue([]);

    mountAbout();
    await flushPromises();

    expect(h.loggerWarn).toHaveBeenCalledWith('about', 'load failed', expect.any(Error));
    expect(wrapper!.text()).toContain('Onda');
  });
});

describe('links', () => {
  it('renders the repository link safely', () => {
    mountAbout();

    const link = wrapper!.get('a');
    expect(link.text()).toBe('GitHub');
    expect(link.attributes('href')).toBe('https://github.com/gb-redRabit/Onda');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener');
  });
});
