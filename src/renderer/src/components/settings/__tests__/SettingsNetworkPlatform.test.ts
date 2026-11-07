import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import SettingsNetworkPlatform from '../SettingsNetworkPlatform.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  status: null as any,
  refresh: vi.fn(),
  ensureLoaded: vi.fn(),
  invoke: vi.fn(),
  confirm: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useYoutubeAuth', () => ({
  useYoutubeAuth: () => ({
    status: state.status,
    refresh: state.refresh,
    ensureLoaded: state.ensureLoaded
  })
}));

const GroupStub = {
  props: ['title', 'description'],
  template: '<section><slot /></section>'
};
const RowStub = { props: ['label', 'description'], template: '<div><slot /></div>' };
const ToggleStub = {
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: '<button class="toggle" @click="$emit(\'update:modelValue\', !modelValue)" />'
};
const CredentialsStub = { template: '<div data-testid="provider-credentials" />' };

let wrapper: VueWrapper | null = null;

function network(overrides: Record<string, unknown> = {}) {
  return {
    defaultQualityPerPlatform: false,
    youtubeQuality: 'best',
    soundcloudQuality: 'best',
    proxyPerPlatform: false,
    proxyYoutube: { enabled: false, host: '', port: 8080 },
    proxySoundcloud: { enabled: false, host: '', port: 8080 },
    ...overrides
  };
}

function mountSettings(method = 'none') {
  state.settings.youtube.method = method;
  wrapper = mount(SettingsNetworkPlatform, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub,
        SettingsProviderCredentials: CredentialsStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonWith(text: string) {
  return buttons().find((button) => button.text() === text)!;
}

function toggles() {
  return wrapper!.findAllComponents(ToggleStub);
}

function selects() {
  return wrapper!.findAll('select');
}

beforeEach(() => {
  state.settings = reactive({
    youtube: { method: 'none', cookiesBrowser: 'chrome' },
    network: network(),
    load: vi.fn(async () => undefined),
    updateYoutube: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(state.settings.youtube, patch);
    }),
    updateNetwork: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(state.settings.network, patch);
    })
  });
  state.status = ref({
    loggedIn: false,
    lastLogin: null as number | null,
    cookiesPath: ''
  });
  state.refresh.mockReset();
  state.refresh.mockResolvedValue(undefined);
  state.ensureLoaded.mockReset();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ success: true });
  state.confirm.mockReset();
  state.confirm.mockReturnValue(true);
  state.t.mockClear();
  vi.stubGlobal('confirm', state.confirm);
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('auth method', () => {
  it('loads status and switches methods', async () => {
    mountSettings();
    await flush();
    expect(state.ensureLoaded).toHaveBeenCalled();

    for (const key of [
      'settings.authDisabled',
      'settings.authElectron',
      'settings.authManual',
      'settings.authBrowser'
    ]) {
      expect(buttonWith(key).exists()).toBe(true);
    }
    expect(buttonWith('settings.authDisabled').classes()).toContain('border-primary');

    await buttonWith('settings.authManual').trigger('click');
    await flush();
    expect(state.settings.updateYoutube).toHaveBeenCalledWith({ method: 'manual' });
    expect(state.refresh).toHaveBeenCalled();
  });

  it('shows the logged-in state and last login', async () => {
    state.status.value = {
      loggedIn: true,
      lastLogin: new Date('2026-01-02T03:04:00').getTime(),
      cookiesPath: ''
    };
    mountSettings('electron');
    await flush();

    expect(wrapper!.text()).toContain('settings.authStatusLoggedIn');
    expect(wrapper!.text()).toContain('settings.authLastLogin');
    expect(wrapper!.text()).toContain('settings.cookiesSecurityHint');
  });

  it('hides the cookies warning when auth is disabled', async () => {
    mountSettings('none');
    await flush();
    expect(wrapper!.text()).not.toContain('settings.cookiesSecurityHint');
  });

  it('renders browser choice for the browser method', async () => {
    mountSettings('browser');
    await flush();
    const select = selects()[0];
    expect(select.findAll('option')).toHaveLength(7);
    expect((select.element as HTMLSelectElement).value).toBe('chrome');

    (select.element as HTMLSelectElement).value = 'firefox';
    await select.trigger('change');
    expect(state.settings.updateYoutube).toHaveBeenCalledWith({ cookiesBrowser: 'firefox' });
  });

  it('renders no account actions for the disabled method', async () => {
    mountSettings('none');
    await flush();
    expect(buttons().some((b) => b.text() === 'settings.loginWithGoogle')).toBe(false);
    expect(buttons().some((b) => b.text() === 'settings.importCookies')).toBe(false);
  });
});

describe('electron login', () => {
  it('logs in, reloads settings and status', async () => {
    mountSettings('electron');
    await flush();
    const login = buttonWith('settings.loginWithGoogle');
    await login.trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('yt:login');
    expect(state.settings.load).toHaveBeenCalled();
    expect(state.refresh).toHaveBeenCalled();
    expect(login.attributes('disabled')).toBeUndefined();
  });

  it('shows login errors and keeps the button disabled while busy', async () => {
    let resolveLogin!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(new Promise((resolve) => (resolveLogin = resolve)));
    mountSettings('electron');
    await flush();
    const login = buttonWith('settings.loginWithGoogle');

    await login.trigger('click');
    expect(login.attributes('disabled')).toBeDefined();

    resolveLogin({ error: 'denied' });
    await flush();
    expect(wrapper!.text()).toContain('denied');
    expect(login.attributes('disabled')).toBeUndefined();
  });

  it('logs out and disables logout while logged out', async () => {
    mountSettings('electron');
    await flush();
    expect(buttonWith('settings.logout').attributes('disabled')).toBeDefined();

    state.status.value = { ...state.status.value, loggedIn: true };
    await flush();
    expect(buttonWith('settings.logout').attributes('disabled')).toBeUndefined();

    await buttonWith('settings.logout').trigger('click');
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('yt:logout');
    expect(state.refresh).toHaveBeenCalled();
  });
});

describe('manual cookies', () => {
  it('imports cookies and shows errors', async () => {
    state.invoke.mockResolvedValueOnce({ error: 'bad file' });
    mountSettings('manual');
    await flush();

    await buttonWith('settings.importCookies').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('yt:importCookies');
    expect(wrapper!.text()).toContain('bad file');
    expect(state.settings.load).toHaveBeenCalled();
  });

  it('exports only after confirmation when a cookie path exists', async () => {
    mountSettings('manual');
    await flush();
    expect(buttons().some((b) => b.text() === 'settings.exportCookies')).toBe(false);

    state.status.value = { ...state.status.value, cookiesPath: 'C:/cookies.txt' };
    await flush();

    state.confirm.mockReturnValueOnce(false);
    await buttonWith('settings.exportCookies').trigger('click');
    await flush();
    expect(state.invoke).not.toHaveBeenCalledWith('yt:exportCookies');

    state.confirm.mockReturnValueOnce(true);
    await buttonWith('settings.exportCookies').trigger('click');
    await flush();
    expect(state.confirm).toHaveBeenCalledWith('settings.cookiesExportWarning');
    expect(state.invoke).toHaveBeenCalledWith('yt:exportCookies');
  });

  it('logs out from the manual method', async () => {
    state.status.value = { ...state.status.value, loggedIn: true };
    mountSettings('manual');
    await flush();
    await buttonWith('settings.logout').trigger('click');
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('yt:logout');
  });
});

describe('quality and proxy settings', () => {
  it('toggles per-platform quality and updates selections', async () => {
    mountSettings();
    await flush();
    const toggle = toggles()[0];
    expect(selects()).toHaveLength(0);

    toggle.vm.$emit('update:modelValue', true);
    await flush();
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      defaultQualityPerPlatform: true
    });
    expect(selects()).toHaveLength(2);

    const [youtube, soundcloud] = selects();
    (youtube.element as HTMLSelectElement).value = 'high';
    await youtube.trigger('change');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({ youtubeQuality: 'high' });

    (soundcloud.element as HTMLSelectElement).value = 'low';
    await soundcloud.trigger('change');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({ soundcloudQuality: 'low' });
  });

  it('toggles per-platform proxy and edits both endpoints', async () => {
    mountSettings();
    await flush();
    const proxyToggle = toggles()[1];
    proxyToggle.vm.$emit('update:modelValue', true);
    await flush();
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({ proxyPerPlatform: true });
    expect(toggles().length).toBe(4);

    const [, , youtubeEnable, soundcloudEnable] = toggles();
    youtubeEnable.vm.$emit('update:modelValue', true);
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      proxyYoutube: { enabled: true, host: '', port: 8080 }
    });

    state.settings.network.proxyYoutube.enabled = true;
    state.settings.network.proxySoundcloud.enabled = true;
    await flush();

    const hostInputs = wrapper!.findAll('input[placeholder="host"]');
    const portInputs = wrapper!.findAll('input[type="number"]');
    (hostInputs[0].element as HTMLInputElement).value = 'proxy.local';
    await hostInputs[0].trigger('input');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      proxyYoutube: { enabled: true, host: 'proxy.local', port: 8080 }
    });

    (portInputs[0].element as HTMLInputElement).value = '9090';
    await portInputs[0].trigger('input');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      proxyYoutube: { enabled: true, host: 'proxy.local', port: 9090 }
    });

    soundcloudEnable.vm.$emit('update:modelValue', true);
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      proxySoundcloud: { enabled: true, host: '', port: 8080 }
    });

    (hostInputs[1].element as HTMLInputElement).value = 'sc.local';
    await hostInputs[1].trigger('input');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      proxySoundcloud: { enabled: true, host: 'sc.local', port: 8080 }
    });

    (portInputs[1].element as HTMLInputElement).value = 'not-a-number';
    await portInputs[1].trigger('input');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({
      proxySoundcloud: { enabled: true, host: 'sc.local', port: 8080 }
    });
  });

  it('renders provider credentials', async () => {
    mountSettings();
    await flush();
    expect(wrapper!.findAll('[data-testid="provider-credentials"]')).toHaveLength(1);
  });
});
