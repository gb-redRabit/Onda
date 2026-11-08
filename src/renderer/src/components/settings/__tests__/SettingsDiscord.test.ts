import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import SettingsDiscord from '../SettingsDiscord.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  getDiscordStatus: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));

const GroupStub = defineComponent({
  props: ['title'],
  template: '<section :data-title="title"><slot /></section>'
});
const RowStub = defineComponent({
  props: ['label', 'description', 'path', 'anchor'],
  template: '<div :data-path="path"><slot /></div>'
});
const ToggleStub = defineComponent({
  props: { modelValue: Boolean, disabled: Boolean },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" :disabled="disabled" />'
});

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(SettingsDiscord, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub, SettingsRow: RowStub, SettingsToggle: ToggleStub }
    }
  });
  return wrapper;
}

function input() {
  return wrapper!.get('[data-testid="settings-discord-client-id"]');
}

function status() {
  return wrapper!.get('[data-testid="settings-discord-status"]');
}

function toggles() {
  return wrapper!.findAllComponents(ToggleStub);
}

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = reactive({
    general: {
      discordClientId: '123456789012345678',
      discordRichPresence: true,
      discordUploadLocalCovers: false,
      discordOnlineCovers: true
    },
    updateGeneral: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(state.settings.general, patch)
    )
  });
  state.getDiscordStatus.mockReset();
  state.getDiscordStatus.mockResolvedValue({ connected: true });
  state.t.mockClear();
  (window as { api?: unknown }).api = { getDiscordStatus: state.getDiscordStatus };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('status', () => {
  it('shows connected, waiting, invalid and off states', async () => {
    mountView();
    await flushPromises();
    expect(status().text()).toBe('settings.discordStatus.connected');

    state.getDiscordStatus.mockResolvedValue({ connected: false });
    state.settings.general.discordClientId = '999999999999999999';
    await flushPromises();
    expect(status().text()).toBe('settings.discordStatus.waiting');

    state.settings.general.discordClientId = '';
    await flushPromises();
    expect(status().text()).toBe('settings.discordStatus.invalid');
    expect(wrapper!.text()).toContain('settings.discordClientIdInvalid');

    state.settings.general.discordRichPresence = false;
    await flushPromises();
    expect(status().text()).toBe('settings.discordStatus.off');
  });

  it('shows an error detail from the status payload', async () => {
    state.getDiscordStatus.mockResolvedValue({ connected: false, error: 'token expired' });
    mountView();
    await flushPromises();
    expect(wrapper!.text()).toContain('token expired');
  });

  it('falls back to null when status lookups fail', async () => {
    state.getDiscordStatus.mockRejectedValueOnce(new Error('ipc'));
    mountView();
    await flushPromises();
    expect(status().text()).toBe('settings.discordStatus.waiting');
  });

  it('polls the status every five seconds and stops on unmount', async () => {
    mountView();
    await flushPromises();
    expect(state.getDiscordStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.getDiscordStatus).toHaveBeenCalledTimes(2);

    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(state.getDiscordStatus).toHaveBeenCalledTimes(2);
  });

  it('refreshes when the presence settings change', async () => {
    mountView();
    await flushPromises();
    state.getDiscordStatus.mockClear();

    state.settings.general.discordRichPresence = false;
    await flushPromises();
    expect(state.getDiscordStatus).toHaveBeenCalled();
  });

  it('handles a missing preload bridge', async () => {
    delete (window as { api?: unknown }).api;
    expect(() => mountView()).not.toThrow();
    await flushPromises();
    expect(status().text()).toBe('settings.discordStatus.waiting');
  });
});

describe('client id', () => {
  it('starts from the saved id and follows external updates', async () => {
    mountView();
    expect((input().element as HTMLInputElement).value).toBe('123456789012345678');

    state.settings.general.discordClientId = '555555555555555555';
    await wrapper!.vm.$nextTick();
    expect((input().element as HTMLInputElement).value).toBe('555555555555555555');
  });

  it('saves a trimmed id on change and blur only when it differs', async () => {
    mountView();
    await wrapper!
      .get('[data-testid="settings-discord-client-id"]')
      .setValue('  999999999999999999  ');
    await input().trigger('change');
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({
      discordClientId: '999999999999999999'
    });

    state.settings.updateGeneral.mockClear();
    await input().trigger('blur');
    expect(state.settings.updateGeneral).not.toHaveBeenCalled();
  });

  it('flags invalid ids and shows the hint', async () => {
    mountView();
    await input().setValue('abc');
    await wrapper!.vm.$nextTick();
    expect(input().classes()).toContain('border-error/60');
    expect(wrapper!.text()).toContain('settings.discordClientIdInvalid');

    await input().setValue('');
    await wrapper!.vm.$nextTick();
    expect(input().classes()).not.toContain('border-error/60');
    expect(wrapper!.text()).toContain('settings.discordClientIdHint');

    await input().setValue('123456789012345678');
    await wrapper!.vm.$nextTick();
    expect(input().classes()).not.toContain('border-error/60');
  });

  it('has numeric input hints', () => {
    mountView();
    expect(input().attributes('inputmode')).toBe('numeric');
    expect(input().attributes('autocomplete')).toBe('off');
    expect(input().attributes('spellcheck')).toBe('false');
  });
});

describe('toggles', () => {
  it('disables presence when no valid saved id exists', async () => {
    state.settings.general.discordClientId = '';
    state.settings.general.discordRichPresence = false;
    mountView();
    expect(toggles()[0].props('disabled')).toBe(true);

    state.settings.general.discordClientId = '123456789012345678';
    await wrapper!.vm.$nextTick();
    expect(toggles()[0].props('disabled')).toBe(false);
  });

  it('keeps presence enabled when it is already on', () => {
    state.settings.general.discordClientId = '';
    state.settings.general.discordRichPresence = true;
    mountView();
    expect(toggles()[0].props('disabled')).toBe(false);
  });

  it('saves the id before enabling presence', async () => {
    mountView();
    (input().element as HTMLInputElement).value = ' 999999999999999999 ';
    await input().trigger('input');
    toggles()[0].vm.$emit('update:modelValue', false);
    expect(state.settings.updateGeneral).toHaveBeenNthCalledWith(1, {
      discordClientId: '999999999999999999'
    });
    expect(state.settings.updateGeneral).toHaveBeenNthCalledWith(2, {
      discordRichPresence: false
    });
  });

  it('forwards cover toggles and disables them without presence', async () => {
    mountView();
    expect(toggles()[1].props('disabled')).toBe(false);
    toggles()[1].vm.$emit('update:modelValue', true);
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({
      discordUploadLocalCovers: true
    });

    toggles()[2].vm.$emit('update:modelValue', false);
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ discordOnlineCovers: false });

    state.settings.general.discordRichPresence = false;
    await wrapper!.vm.$nextTick();
    expect(toggles()[1].props('disabled')).toBe(true);
    expect(toggles()[2].props('disabled')).toBe(true);
  });
});

describe('setup instructions', () => {
  it('links to the developer portal', () => {
    mountView();
    const link = wrapper!.get('a');
    expect(link.attributes('href')).toBe('https://discord.com/developers/applications');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noreferrer');
    expect(wrapper!.findAll('li')).toHaveLength(6);
    expect(wrapper!.text()).toContain('settings.discordSetupIntro');
  });
});
