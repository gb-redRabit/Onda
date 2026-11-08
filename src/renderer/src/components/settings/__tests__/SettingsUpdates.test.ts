import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import SettingsUpdates from '../SettingsUpdates.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  on: vi.fn(),
  getUpdaterState: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  cleanup: vi.fn(),
  warn: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@shared/logger', () => ({ logger: { warn: state.warn, info: vi.fn(), error: vi.fn() } }));

const GroupStub = defineComponent({
  props: ['title'],
  template: '<section :data-title="title"><slot /></section>'
});
const RowStub = defineComponent({
  props: ['label', 'description', 'path', 'anchor'],
  template: '<div :data-path="path"><slot /></div>'
});
const ToggleStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" />'
});
const TitleStub = defineComponent({
  props: ['title'],
  template: '<h3>{{ title }}</h3>'
});

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(SettingsUpdates, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub,
        SettingsSectionTitle: TitleStub
      }
    }
  });
  return wrapper;
}

function emitUpdater(payload: Record<string, unknown>) {
  const handler = state.on.mock.calls[0][1];
  handler(payload);
  return wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.settings = reactive({
    updates: { autoCheck: true, checkInterval: 'daily' },
    updateUpdates: vi.fn()
  });
  state.on.mockReset();
  state.on.mockReturnValue(state.cleanup);
  state.cleanup.mockReset();
  state.getUpdaterState.mockReset();
  state.getUpdaterState.mockResolvedValue({
    status: 'idle',
    current: '1.0.0',
    version: '',
    progress: 0,
    error: '',
    enabled: true
  });
  state.checkForUpdates.mockReset();
  state.checkForUpdates.mockResolvedValue({ checking: true });
  state.downloadUpdate.mockReset();
  state.downloadUpdate.mockResolvedValue(undefined);
  state.installUpdate.mockReset();
  state.warn.mockReset();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    on: state.on,
    getUpdaterState: state.getUpdaterState,
    checkForUpdates: state.checkForUpdates,
    downloadUpdate: state.downloadUpdate,
    installUpdate: state.installUpdate
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('settings controls', () => {
  it('toggles automatic update checks', () => {
    mountView();
    const toggle = wrapper!.findComponent(ToggleStub);
    expect(toggle.props('modelValue')).toBe(true);
    toggle.vm.$emit('update:modelValue', false);
    expect(state.settings.updateUpdates).toHaveBeenCalledWith({ autoCheck: false });
  });

  it('renders interval options and marks the active one', async () => {
    mountView();
    const labels = ['settings.onStartup', 'settings.hourly', 'settings.daily', 'settings.weekly'];
    const buttons = wrapper!.findAll('button').filter((b) => labels.includes(b.text()));
    expect(buttons).toHaveLength(4);
    const active = buttons.find((b) => b.text() === 'settings.daily')!;
    expect(active.classes()).toContain('bg-primary');

    await buttons.find((b) => b.text() === 'settings.weekly')!.trigger('click');
    expect(state.settings.updateUpdates).toHaveBeenCalledWith({ checkInterval: 'weekly' });
  });

  it('shows a developer-only message when updates are disabled', async () => {
    state.getUpdaterState.mockResolvedValue({
      status: 'idle',
      current: '',
      version: '',
      progress: 0,
      error: '',
      enabled: false
    });
    mountView();
    await flushPromises();
    expect(wrapper!.text()).toContain('settings.updateDevOnly');
    expect(wrapper!.text()).toContain('settings.updateDevOnlyDesc');
  });
});

describe('updater state hydration', () => {
  it('subscribes to events and hydrates state on mount', async () => {
    state.getUpdaterState.mockResolvedValue({
      status: 'available',
      current: '1.2.3',
      version: '2.0.0',
      progress: 0,
      error: '',
      enabled: true
    });
    mountView();
    expect(state.on).toHaveBeenCalledWith('updater:event', expect.any(Function));
    await flushPromises();
    expect(wrapper!.text()).toContain('v1.2.3');
    expect(wrapper!.text()).toContain('settings.updateAvailable');
    expect(wrapper!.text()).toContain('v2.0.0');
  });

  it('logs hydration failures', async () => {
    state.getUpdaterState.mockRejectedValueOnce(new Error('ipc'));
    mountView();
    await flushPromises();
    expect(state.warn).toHaveBeenCalledWith('updates', 'getUpdaterState failed', expect.any(Error));
  });

  it('handles a missing preload bridge', async () => {
    delete (window as { api?: unknown }).api;
    expect(() => mountView()).not.toThrow();
    await flushPromises();
  });

  it('releases the event subscription on unmount', async () => {
    mountView();
    await flushPromises();
    wrapper!.unmount();
    wrapper = null;
    expect(state.cleanup).toHaveBeenCalled();
  });
});

describe('updater events', () => {
  it('maps checking, available and not-available events', async () => {
    mountView();
    await flushPromises();

    await emitUpdater({ event: 'checking-for-update' });
    expect(wrapper!.text()).toContain('settings.checking');

    await emitUpdater({ event: 'update-available', version: '3.0.0' });
    expect(wrapper!.text()).toContain('settings.updateAvailable');
    expect(wrapper!.text()).toContain('v3.0.0');

    await emitUpdater({ event: 'update-not-available' });
    expect(wrapper!.text()).toContain('settings.updateUpToDate');
  });

  it('maps download progress and completion', async () => {
    mountView();
    await flushPromises();

    await emitUpdater({ event: 'download-progress', percent: 42.6 });
    expect(wrapper!.text()).toContain('settings.downloading');
    expect(wrapper!.text()).toContain('43%');
    expect(wrapper!.find('div[style*="width: 42.6%"]').exists()).toBe(true);

    await emitUpdater({ event: 'update-downloaded' });
    expect(wrapper!.text()).toContain('settings.updateReady');
  });

  it('shows errors with a translated fallback', async () => {
    mountView();
    await flushPromises();
    await emitUpdater({ event: 'error' });
    expect(wrapper!.text()).toContain('settings.updateError');

    await emitUpdater({ event: 'error', error: 'boom' });
    expect(wrapper!.text()).toContain('boom');
  });

  it('ignores unknown events', async () => {
    mountView();
    await flushPromises();
    await emitUpdater({ event: 'unknown' });
    expect(wrapper!.text()).toContain('v1.0.0');
  });
});

describe('actions and status buttons', () => {
  it('downloads an available update', async () => {
    mountView();
    await flushPromises();
    await emitUpdater({ event: 'update-available', version: '2.0.0' });

    const download = wrapper!
      .findAll('button')
      .find((b) => b.text().includes('settings.downloadUpdate'))!;
    await download.trigger('click');
    expect(state.downloadUpdate).toHaveBeenCalled();
    expect(wrapper!.text()).toContain('settings.downloading');
    expect(wrapper!.text()).toContain('0%');
  });

  it('installs a downloaded update', async () => {
    mountView();
    await flushPromises();
    await emitUpdater({ event: 'update-downloaded' });

    const install = wrapper!
      .findAll('button')
      .find((b) => b.text().includes('settings.restartInstall'))!;
    await install.trigger('click');
    expect(state.installUpdate).toHaveBeenCalled();
  });

  it('starts a manual check and resets to idle when not checking', async () => {
    state.checkForUpdates.mockResolvedValue({ checking: false });
    mountView();
    await flushPromises();

    const check = wrapper!.get('button.mt-4');
    await check.trigger('click');
    await flushPromises();
    expect(state.checkForUpdates).toHaveBeenCalled();
    expect(wrapper!.text()).not.toContain('settings.checking');
  });

  it('keeps the checking state while the updater runs', async () => {
    state.checkForUpdates.mockResolvedValue({ checking: true });
    mountView();
    await flushPromises();

    await wrapper!.get('button.mt-4').trigger('click');
    await flushPromises();
    expect(wrapper!.text()).toContain('settings.checking');
  });

  it('reports check failures', async () => {
    state.checkForUpdates.mockRejectedValueOnce(new Error('ipc'));
    mountView();
    await flushPromises();

    await wrapper!.get('button.mt-4').trigger('click');
    await flushPromises();
    expect(state.warn).toHaveBeenCalledWith('updates', 'check failed', expect.any(Error));
    expect(wrapper!.find('.text-error').exists()).toBe(true);
    expect(wrapper!.text()).not.toContain('settings.checking');
  });

  it('disables the check button while busy or disabled', async () => {
    mountView();
    await flushPromises();
    const check = () => wrapper!.get('button.mt-4');

    expect(check().attributes('disabled')).toBeUndefined();
    await emitUpdater({ event: 'checking-for-update' });
    expect(check().attributes('disabled')).toBeDefined();

    await emitUpdater({ event: 'download-progress', percent: 10 });
    expect(check().attributes('disabled')).toBeDefined();

    state.settings.updates = { autoCheck: true, checkInterval: 'daily' };
    await emitUpdater({ event: 'update-not-available' });
    expect(check().attributes('disabled')).toBeUndefined();
  });

  it('disables the check button when updates are disabled', async () => {
    state.getUpdaterState.mockResolvedValue({
      status: 'idle',
      current: '',
      version: '',
      progress: 0,
      error: '',
      enabled: false
    });
    mountView();
    await flushPromises();
    expect(wrapper!.get('button.mt-4').attributes('disabled')).toBeDefined();
  });
});
