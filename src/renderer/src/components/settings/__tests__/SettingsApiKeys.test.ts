import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  t: vi.fn((key: string) => key),
  invoke: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));

const GroupStub = defineComponent({
  name: 'SettingsGroupStub',
  props: { title: String, description: String },
  template: '<section><slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRowStub',
  props: { anchor: String, label: String, description: String },
  template: '<div data-testid="settings-row" />'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggleStub',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" :data-value="String(modelValue)" />'
});
const ScrobblingStub = defineComponent({
  name: 'SettingsScrobblingStub',
  template: '<div data-testid="scrobbling" />'
});

import SettingsApiKeys from '../SettingsApiKeys.vue';

let wrapper: VueWrapper | null = null;

function key(overrides: Record<string, unknown> = {}) {
  return {
    id: 'yt',
    name: 'YouTube',
    service: 'youtube',
    key: 'secret',
    preview: '…1234',
    isActive: true,
    ...overrides
  };
}

function setup() {
  wrapper = mount(SettingsApiKeys, {
    global: {
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub,
        SettingsScrobbling: ScrobblingStub
      },
      mocks: { $t: (key: string) => key }
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.t.mockClear();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue('strong');
  state.settings = reactive({
    apiKeys: {
      keys: [key(), key({ id: 'scrobble:lastfm', name: 'Last.fm', service: 'lastfm' })]
    },
    saveImmediate: vi.fn()
  });
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('storage notice', () => {
  it('asks main about secret storage on mount', async () => {
    setup();
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('settings:secretStorageStatus');
  });

  it('warns about weak storage', async () => {
    state.invoke.mockResolvedValueOnce('weak');
    setup();
    await flush();
    expect(wrapper!.text()).toContain('settings.secretStorageWeak');
  });

  it('errors about unavailable storage', async () => {
    state.invoke.mockResolvedValueOnce('unavailable');
    setup();
    await flush();
    expect(wrapper!.text()).toContain('settings.secretStorageUnavailable');
  });

  it('stays quiet for strong or failed lookups', async () => {
    setup();
    await flush();
    expect(wrapper!.text()).not.toContain('settings.secretStorageWeak');

    wrapper!.unmount();
    state.invoke.mockRejectedValueOnce(new Error('old main'));
    setup();
    await flush();
    expect(wrapper!.text()).not.toContain('settings.secretStorageUnavailable');
  });
});

describe('listing', () => {
  it('shows user keys without scrobbling entries', () => {
    setup();

    expect(wrapper!.text()).toContain('YouTube');
    expect(wrapper!.text()).toContain('youtube · …1234');
    expect(wrapper!.text()).not.toContain('Last.fm');
    expect(wrapper!.find('[data-testid="scrobbling"]').exists()).toBe(true);
  });

  it('omits the preview separator when absent', () => {
    state.settings.apiKeys.keys = [key({ preview: undefined })];
    setup();

    expect(wrapper!.text()).toContain('youtube');
    expect(wrapper!.text()).not.toContain('·');
  });

  it('shows an empty message', () => {
    state.settings.apiKeys.keys = [key({ id: 'scrobble:x' })];
    setup();

    expect(wrapper!.text()).toContain('settings.noApiKeys');
    expect(wrapper!.find('[data-testid="toggle"]').exists()).toBe(false);
  });

  it('toggles a key', async () => {
    setup();
    const toggle = wrapper!.getComponent(ToggleStub);
    expect(toggle.props('modelValue')).toBe(true);

    toggle.vm.$emit('update:modelValue', false);

    expect(state.settings.apiKeys.keys[0].isActive).toBe(false);
    expect(state.settings.saveImmediate).toHaveBeenCalledTimes(1);
  });

  it('removes a key', async () => {
    setup();
    await buttonByText('common.delete').trigger('click');

    expect(state.settings.apiKeys.keys.map((entry: any) => entry.id)).toEqual(['scrobble:lastfm']);
    expect(state.settings.saveImmediate).toHaveBeenCalledTimes(1);
  });
});

describe('adding', () => {
  async function open() {
    setup();
    await buttonByText('settings.addApiKey').trigger('click');
  }

  it('adds a trimmed key with the selected service', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    await open();

    await wrapper!.get('input[placeholder="settings.apiKeyName"]').setValue('  My key  ');
    await wrapper!.get('select').setValue('openai');
    await wrapper!.get('input[placeholder="settings.apiKeyValue"]').setValue('  sk-123  ');
    await buttonByText('common.save').trigger('click');

    const added = state.settings.apiKeys.keys.at(-1);
    expect(added).toMatchObject({
      id: (12345).toString(36),
      name: 'My key',
      service: 'openai',
      key: 'sk-123',
      isActive: true
    });
    expect(state.settings.saveImmediate).toHaveBeenCalledTimes(1);
    expect(wrapper!.find('input[placeholder="settings.apiKeyName"]').exists()).toBe(false);
  });

  it('rejects missing names or values', async () => {
    await open();

    await buttonByText('common.save').trigger('click');
    await wrapper!.get('input[placeholder="settings.apiKeyName"]').setValue('  ');
    await wrapper!.get('input[placeholder="settings.apiKeyValue"]').setValue('value');
    await buttonByText('common.save').trigger('click');
    await wrapper!.get('input[placeholder="settings.apiKeyName"]').setValue('name');
    await wrapper!.get('input[placeholder="settings.apiKeyValue"]').setValue('  ');
    await buttonByText('common.save').trigger('click');

    expect(state.settings.apiKeys.keys).toHaveLength(2);
    expect(state.settings.saveImmediate).not.toHaveBeenCalled();
  });

  it('cancels the form without saving', async () => {
    await open();
    await wrapper!.get('input[placeholder="settings.apiKeyName"]').setValue('tmp');

    await buttonByText('common.cancel').trigger('click');

    expect(wrapper!.find('input[placeholder="settings.apiKeyName"]').exists()).toBe(false);
    expect(state.settings.apiKeys.keys).toHaveLength(2);
    expect(state.settings.saveImmediate).not.toHaveBeenCalled();
  });

  it('works without saveImmediate', async () => {
    state.settings.saveImmediate = undefined;
    await open();
    await wrapper!.get('input[placeholder="settings.apiKeyName"]').setValue('name');
    await wrapper!.get('input[placeholder="settings.apiKeyValue"]').setValue('value');

    await expect(buttonByText('common.save').trigger('click')).resolves.toBeUndefined();
    expect(state.settings.apiKeys.keys).toHaveLength(3);
  });
});
