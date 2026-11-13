import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  readSelect: vi.fn((event: Event, values: readonly string[]) => {
    const value = (event.target as HTMLSelectElement).value;
    return values.includes(value) ? value : values[0];
  })
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/selectOptions', () => ({ readSelect: state.readSelect }));

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  template: '<section><slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: {
    label: { type: String },
    description: { type: String },
    path: { type: String },
    anchor: { type: String }
  },
  template: '<div data-testid="row">{{ label }}<slot /></div>'
});

import SettingsSystemLogs from '../SettingsSystemLogs.vue';

function mountLogs(general: Record<string, unknown> = {}) {
  state.settings = reactive({
    general,
    updateGeneral: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(state.settings.general, patch)
    )
  });
  return mount(SettingsSystemLogs, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub, SettingsRow: RowStub }
    }
  });
}

beforeEach(() => {
  state.readSelect.mockClear();
});

describe('SettingsSystemLogs', () => {
  it('renders defaults when settings are missing', () => {
    const wrapper = mountLogs();
    const select = wrapper.get('select');
    const range = wrapper.get('input[type="range"]');

    expect(select.attributes('value')).toBe('info');
    expect(range.attributes('value')).toBe('10');
    expect(wrapper.text()).toContain('settings.logMaxSize: 10 MB');
  });

  it('renders the stored values', () => {
    const wrapper = mountLogs({ logLevel: 'error', logMaxSizeMB: 25 });

    expect(wrapper.get('select').attributes('value')).toBe('error');
    expect(wrapper.get('input[type="range"]').attributes('value')).toBe('25');
    expect(wrapper.text()).toContain('settings.logMaxSize: 25 MB');
  });

  it('updates the log level through readSelect', async () => {
    const wrapper = mountLogs();
    const select = wrapper.get('select');

    await select.setValue('warn');

    expect(state.readSelect).toHaveBeenCalledWith(expect.any(Event), [
      'debug',
      'info',
      'warn',
      'error'
    ]);
    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ logLevel: 'warn' });
  });

  it('updates the max size from the range input', async () => {
    const wrapper = mountLogs();
    const range = wrapper.get('input[type="range"]');

    await range.setValue('42');

    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ logMaxSizeMB: 42 });
  });

  it('shows the telemetry-disabled note', () => {
    const wrapper = mountLogs();

    expect(wrapper.text()).toContain('settings.telemetryOff');
  });
});
