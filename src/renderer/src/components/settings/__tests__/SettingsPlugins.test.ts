import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import SettingsPlugins from '../SettingsPlugins.vue';

const state = vi.hoisted(() => ({
  store: null as any,
  notify: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => state.store }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));

const SettingsGroupStub = {
  props: ['title', 'description'],
  template: '<div><slot /></div>'
};
const SettingsRowStub = { props: ['label'], template: '<div><slot /></div>' };
const ToggleStub = {
  props: ['modelValue', 'disabled', 'label'],
  emits: ['update:modelValue'],
  template:
    '<button v-bind="$attrs" @click="$emit(\'update:modelValue\', !modelValue)">toggle</button>'
};
const InputStub = {
  props: ['modelValue', 'type', 'size', 'min', 'max', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: '<input />'
};
const GuideStub = { emits: ['close'], template: '<div>guide</div>' };
const PermissionStub = {
  props: ['plugin'],
  emits: ['confirm', 'cancel'],
  template: '<div>permissions</div>'
};

let wrapper: VueWrapper | null = null;

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Demo plugin',
    version: '1.2.0',
    author: 'Author',
    description: 'Does things',
    status: 'loaded',
    enabled: true,
    error: null,
    permissionReviewRequired: false,
    vue: true,
    ...overrides
  };
}

function example(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ex1',
    name: 'Example plugin',
    description: 'An example',
    permissions: {
      storage: true,
      notifications: true,
      player: true,
      visual: true,
      network: { allow: ['example.com'] }
    },
    ...overrides
  };
}

function mountSettings() {
  wrapper = mount(SettingsPlugins, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: SettingsGroupStub,
        SettingsRow: SettingsRowStub,
        SettingsToggle: ToggleStub,
        Input: InputStub,
        PluginsGuide: GuideStub,
        PluginPermissionDialog: PermissionStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.store = reactive({
    plugins: [plugin()],
    examples: [example()],
    loading: false,
    logs: {} as Record<string, string[]>,
    commands: [] as Array<{ id: string; label: string; pluginId?: string }>,
    settingFields: vi.fn(() => [] as Array<Record<string, unknown>>),
    settingsOf: vi.fn(() => ({}) as Record<string, unknown>),
    toggle: vi.fn(async () => true),
    approveAndEnable: vi.fn(async () => true),
    installFromFolder: vi.fn(async () => ({ success: true })),
    installExample: vi.fn(async () => ({ success: true })),
    uninstall: vi.fn(async () => true),
    refresh: vi.fn(async () => undefined),
    dispatchCommand: vi.fn(),
    saveSetting: vi.fn(async () => true)
  });
  state.notify.mockClear();
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('rendering', () => {
  it('renders plugins, status and capability badges', () => {
    mountSettings();
    expect(wrapper!.text()).toContain('Demo plugin');
    expect(wrapper!.text()).toContain('1.2.0');
    expect(wrapper!.text()).toContain('plugins.status.loaded');
    expect(wrapper!.text()).toContain('Example plugin');
    expect(wrapper!.text()).toContain('plugins.permissionStorage');
    expect(wrapper!.text()).toContain('plugins.permissionNetwork');
    expect(wrapper!.text()).toContain('example.com');
  });

  it('marks an example as installed when its plugin exists', () => {
    state.store.examples = [example({ id: 'p1' })];
    mountSettings();
    expect(wrapper!.text()).toContain('plugins.examplesInstalled');
  });

  it('shows error status and disables refresh while loading', () => {
    state.store.plugins = [plugin({ status: 'error', error: 'boom', enabled: false })];
    state.store.loading = true;
    mountSettings();
    expect(wrapper!.text()).toContain('boom');
    expect(wrapper!.get('[data-testid="plugins-refresh"]').attributes('disabled')).toBeDefined();
  });
});

describe('toggles and permissions', () => {
  it('disables an enabled plugin directly', async () => {
    mountSettings();
    await wrapper!.get('[data-testid="plugin-toggle-p1"]').trigger('click');
    expect(state.store.toggle).toHaveBeenCalledWith('p1');
    expect(state.store.approveAndEnable).not.toHaveBeenCalled();
  });

  it('requires permission review before enabling', async () => {
    state.store.plugins = [plugin({ enabled: false, permissionReviewRequired: true })];
    mountSettings();
    await wrapper!.get('[data-testid="plugin-toggle-p1"]').trigger('click');
    await wrapper!.vm.$nextTick();

    const dialog = wrapper!.findComponent(PermissionStub);
    expect(dialog.exists()).toBe(true);
    dialog.vm.$emit('confirm');
    await flush();

    expect(state.store.approveAndEnable).toHaveBeenCalledWith('p1');
    expect(state.notify).not.toHaveBeenCalled();
    expect(wrapper!.findComponent(PermissionStub).exists()).toBe(false);
  });

  it('notifies when permissions changed during review and supports cancel', async () => {
    state.store.plugins = [plugin({ enabled: false })];
    state.store.approveAndEnable.mockResolvedValueOnce(false);
    mountSettings();
    await wrapper!.get('[data-testid="plugin-toggle-p1"]').trigger('click');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(PermissionStub).vm.$emit('confirm');
    await flush();
    expect(state.notify).toHaveBeenCalledWith(
      'error',
      'plugins.enableFailed',
      'plugins.permissionChangedWarning'
    );

    await wrapper!.get('[data-testid="plugin-toggle-p1"]').trigger('click');
    await wrapper!.vm.$nextTick();
    wrapper!.findComponent(PermissionStub).vm.$emit('cancel');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(PermissionStub).exists()).toBe(false);
  });
});

describe('install, refresh and uninstall', () => {
  it('installs from a folder with success, cancel and error feedback', async () => {
    mountSettings();
    const install = wrapper!
      .findAll('button')
      .find((b) => b.text().includes('plugins.installFromFolder'))!;
    await install.trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith(
      'success',
      'plugins.installSuccess',
      'plugins.installDisabledHint'
    );

    state.store.installFromFolder.mockResolvedValueOnce({ success: false, error: 'cancelled' });
    await install.trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledTimes(1);

    state.store.installFromFolder.mockResolvedValueOnce({ success: false, error: 'bad zip' });
    await install.trigger('click');
    await flush();
    expect(state.notify).toHaveBeenLastCalledWith('error', 'plugins.installError', 'bad zip');
  });

  it('installs examples and reports failures', async () => {
    mountSettings();
    const install = wrapper!
      .findAll('button')
      .find((b) => b.text().includes('plugins.examplesInstall'))!;
    await install.trigger('click');
    await flush();
    expect(state.store.installExample).toHaveBeenCalledWith('ex1');
    expect(state.notify).toHaveBeenCalledWith(
      'success',
      'plugins.installSuccess',
      'plugins.installDisabledHint'
    );

    state.store.installExample.mockResolvedValueOnce({ success: false, error: 'nope' });
    await install.trigger('click');
    await flush();
    expect(state.notify).toHaveBeenLastCalledWith('error', 'plugins.examplesError', 'nope');
  });

  it('refreshes and uninstalls', async () => {
    mountSettings();
    await wrapper!.get('[data-testid="plugins-refresh"]').trigger('click');
    expect(state.store.refresh).toHaveBeenCalled();

    const uninstall = wrapper!.get('[aria-label="plugins.uninstall"]');
    await uninstall.trigger('click');
    expect(state.store.uninstall).toHaveBeenCalledWith('p1');
  });
});

describe('logs, commands and settings', () => {
  it('toggles plugin logs', async () => {
    state.store.logs = { p1: ['first log line'] };
    mountSettings();
    expect(wrapper!.text()).not.toContain('first log line');

    const logs = wrapper!.findAll('button').find((b) => b.text().includes('plugins.logs'))!;
    await logs.trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('first log line');
  });

  it('dispatches plugin commands', async () => {
    state.store.commands = [{ id: 'cmd1', label: 'Run me', pluginId: 'p1' }];
    mountSettings();
    const command = wrapper!.findAll('button').find((b) => b.text().includes('Run me'))!;
    await command.trigger('click');
    expect(state.store.dispatchCommand).toHaveBeenCalledWith('cmd1');
  });

  it('renders setting fields with defaults and saves changes', async () => {
    state.store.settingFields.mockReturnValue([
      { key: 'name', label: 'Name', type: 'text', default: 'default' },
      { key: 'count', label: 'Count', type: 'number', default: 2, min: 0, max: 10 },
      { key: 'flag', label: 'Flag', type: 'boolean', default: true }
    ]);
    state.store.settingsOf.mockReturnValue({ name: 'stored', flag: false });
    mountSettings();

    const text = wrapper!.get('[data-testid="plugin-setting-p1-name"]');
    expect(text.attributes('value')).toBeUndefined();
    expect(text.element).toHaveProperty('value', '');
    const number = wrapper!.findAllComponents(InputStub)[1];
    expect(number.props('modelValue')).toBe(2);

    (text.element as HTMLInputElement).value = 'new';
    await text.trigger('change');
    expect(state.store.saveSetting).toHaveBeenCalledWith('p1', 'name', 'new');
  });

  it('opens and closes the plugins guide', async () => {
    mountSettings();
    expect(wrapper!.findComponent(GuideStub).exists()).toBe(false);
    await wrapper!.get('[data-testid="plugins-guide-open"]').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(GuideStub).exists()).toBe(true);
    wrapper!.findComponent(GuideStub).vm.$emit('close');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(GuideStub).exists()).toBe(false);
  });
});
