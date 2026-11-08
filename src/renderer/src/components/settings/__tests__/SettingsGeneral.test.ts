import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import SettingsGeneral from '../SettingsGeneral.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  ui: null as any,
  loadLocale: vi.fn(),
  switching: null as any,
  switchToCompact: vi.fn(),
  getAutoLaunch: vi.fn(),
  setAutoLaunch: vi.fn(),
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/i18n', () => ({ loadLocaleMessages: state.loadLocale }));
vi.mock('@renderer/composables/useCompactSwitch', () => ({
  useCompactSwitch: () => ({
    switching: state.switching,
    switchToCompact: state.switchToCompact
  })
}));

const GroupStub = defineComponent({
  props: ['title'],
  template: '<section :data-title="title"><slot /></section>'
});
const RowStub = defineComponent({
  props: ['label', 'description', 'anchor'],
  template: '<div :data-anchor="anchor"><slot /></div>'
});
const ToggleStub = defineComponent({
  props: { modelValue: Boolean, disabled: Boolean },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" :disabled="disabled" />'
});

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(SettingsGeneral, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub, SettingsRow: RowStub, SettingsToggle: ToggleStub }
    }
  });
  return wrapper;
}

function toggles() {
  return wrapper!.findAllComponents(ToggleStub);
}

function languageButtons() {
  return wrapper!
    .findAll('button')
    .filter((b) => b.text().includes('Polski') || b.text().includes('English'));
}

beforeEach(() => {
  state.settings = reactive({
    appearance: { locale: 'pl' },
    general: {
      autoLaunch: true,
      startMinimized: false,
      closeToTray: true,
      restoreSession: true
    },
    updateAppearance: vi.fn(),
    updateGeneral: vi.fn(),
    saveImmediate: vi.fn()
  });
  state.ui = { openSetupWizard: vi.fn() };
  state.loadLocale.mockReset();
  state.loadLocale.mockResolvedValue(undefined);
  state.switching = ref(false);
  state.switchToCompact.mockReset();
  state.getAutoLaunch.mockReset();
  state.getAutoLaunch.mockResolvedValue({ enabled: true, hidden: true });
  state.setAutoLaunch.mockReset();
  state.setAutoLaunch.mockResolvedValue(undefined);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue('compact');
  state.t.mockClear();
  localStorage.clear();
  (window as { api?: unknown }).api = {
    getAutoLaunch: state.getAutoLaunch,
    setAutoLaunch: state.setAutoLaunch,
    invoke: state.invoke
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  localStorage.clear();
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('language', () => {
  it('renders both languages and marks the active locale', () => {
    mountView();
    const buttons = languageButtons();
    expect(buttons).toHaveLength(2);
    expect(buttons[0].classes()).toContain('border-primary');
    expect(buttons[1].classes()).not.toContain('border-primary');
    expect(wrapper!.text()).toContain('🇵🇱');
    expect(wrapper!.text()).toContain('🇬🇧');
  });

  it('loads and stores the selected locale', async () => {
    mountView();
    await languageButtons()[1].trigger('click');
    await Promise.resolve();

    expect(state.loadLocale).toHaveBeenCalledWith('en');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ locale: 'en' });
    expect(localStorage.getItem('onda-locale')).toBe('en');
  });

  it('tolerates storage failures', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    mountView();
    await languageButtons()[0].trigger('click');
    await expect(Promise.resolve()).resolves.toBeUndefined();
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ locale: 'pl' });
  });
});

describe('startup state', () => {
  it('hydrates autostart and compact startup', async () => {
    mountView();
    await flushPromises();

    expect(state.getAutoLaunch).toHaveBeenCalled();
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({
      autoLaunch: true,
      startMinimized: true
    });
    expect(state.invoke).toHaveBeenCalledWith('app:getStartupMode');
    expect(toggles()[4].props('modelValue')).toBe(true);
  });

  it('ignores autostart and startup lookup failures', async () => {
    state.getAutoLaunch.mockRejectedValueOnce(new Error('ipc'));
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    expect(() => mountView()).not.toThrow();
    await flushPromises();
    expect(toggles()[4].props('modelValue')).toBe(false);
  });

  it('handles missing autostart data', async () => {
    state.getAutoLaunch.mockResolvedValueOnce(null);
    mountView();
    await Promise.resolve();
    expect(state.settings.updateGeneral).not.toHaveBeenCalled();
  });
});

describe('toggles', () => {
  it('updates and persists auto-launch', async () => {
    mountView();
    toggles()[0].vm.$emit('update:modelValue', false);
    await Promise.resolve();

    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ autoLaunch: false });
    expect(state.settings.saveImmediate).toHaveBeenCalled();
    expect(state.setAutoLaunch).toHaveBeenCalledWith({ enabled: false, hidden: false });
  });

  it('disables start-minimized without auto-launch', async () => {
    state.settings.general.autoLaunch = false;
    mountView();
    expect(toggles()[1].props('disabled')).toBe(true);
  });

  it('updates start-minimized and syncs autostart when enabled', async () => {
    mountView();
    toggles()[1].vm.$emit('update:modelValue', true);
    await Promise.resolve();

    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ startMinimized: true });
    expect(state.settings.saveImmediate).toHaveBeenCalled();
    expect(state.setAutoLaunch).toHaveBeenCalledWith({ enabled: true, hidden: true });
  });

  it('skips autostart sync when auto-launch is off', () => {
    state.settings.general.autoLaunch = false;
    mountView();
    toggles()[1].vm.$emit('update:modelValue', true);
    expect(state.setAutoLaunch).not.toHaveBeenCalled();
  });

  it('updates close-to-tray and forwards to main', async () => {
    mountView();
    toggles()[2].vm.$emit('update:modelValue', false);
    await Promise.resolve();

    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ closeToTray: false });
    expect(state.settings.saveImmediate).toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith('app:setCloseToTray', false);
  });

  it('tolerates close-to-tray failures', async () => {
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'app:setCloseToTray') throw new Error('ipc');
      return 'compact';
    });
    mountView();
    toggles()[2].vm.$emit('update:modelValue', true);
    await expect(Promise.resolve()).resolves.toBeUndefined();
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ closeToTray: true });
  });

  it('updates restore-session', () => {
    mountView();
    toggles()[3].vm.$emit('update:modelValue', false);
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ restoreSession: false });
  });

  it('updates compact startup and persists the mode', async () => {
    mountView();
    toggles()[4].vm.$emit('update:modelValue', false);
    await Promise.resolve();
    expect(state.invoke).toHaveBeenCalledWith('app:setStartupMode', 'main');

    toggles()[4].vm.$emit('update:modelValue', true);
    await Promise.resolve();
    expect(state.invoke).toHaveBeenLastCalledWith('app:setStartupMode', 'compact');
  });

  it('tolerates startup-mode persistence failures', async () => {
    state.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'app:setStartupMode') throw new Error('ipc');
      return 'compact';
    });
    mountView();
    toggles()[4].vm.$emit('update:modelValue', true);
    await expect(Promise.resolve()).resolves.toBeUndefined();
    expect(state.invoke).toHaveBeenCalledWith('app:setStartupMode', 'compact');
  });
});

describe('buttons', () => {
  it('switches to the compact UI', async () => {
    mountView();
    const switchButton = wrapper!.get('[data-testid="settings-compact-switch-now"]');
    expect(switchButton.attributes('disabled')).toBeUndefined();
    await switchButton.trigger('click');
    expect(state.switchToCompact).toHaveBeenCalled();

    state.switching.value = true;
    await wrapper!.vm.$nextTick();
    expect(
      wrapper!.get('[data-testid="settings-compact-switch-now"]').attributes('disabled')
    ).toBeDefined();
  });

  it('opens the setup wizard', async () => {
    mountView();
    await wrapper!.get('[data-testid="settings-open-wizard"]').trigger('click');
    expect(state.ui.openSetupWizard).toHaveBeenCalled();
  });
});
