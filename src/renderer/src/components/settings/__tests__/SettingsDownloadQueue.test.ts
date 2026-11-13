import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: { title: { type: String }, description: { type: String } },
  template: '<section data-testid="group">{{ title }}<slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: { label: { type: String }, description: { type: String } },
  template: '<div data-testid="row">{{ label }}<slot /></div>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: { modelValue: { type: Boolean } },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" />'
});

import SettingsDownloadQueue from '../SettingsDownloadQueue.vue';

function mountQueue(over: Record<string, unknown> = {}) {
  h.settings = reactive({
    download: {
      maxConcurrent: 2,
      retryAttempts: 3,
      retryBaseMs: 1500,
      hashFiles: true,
      autoDownloadSubscriptions: false,
      nightScheduleEnabled: false,
      nightScheduleStart: 22,
      nightScheduleEnd: 6,
      autoAddDownloadFolder: false,
      ...over
    },
    updateDownload: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(h.settings.download, patch)
    )
  });
  return mount(SettingsDownloadQueue, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub, SettingsRow: RowStub, SettingsToggle: ToggleStub }
    }
  });
}

beforeEach(() => {
  // no-op; state is rebuilt per mount
});

describe('SettingsDownloadQueue', () => {
  it('shows the concurrency and retry values', () => {
    const wrapper = mountQueue();
    const ranges = wrapper.findAll('input[type="range"]');

    expect(ranges[0].attributes('value')).toBe('2');
    expect(ranges[1].attributes('value')).toBe('3');
    expect(wrapper.text()).toContain('settings.maxConcurrent 2');
    expect(wrapper.text()).toContain('settings.retryAttempts: 3');
  });

  it('falls back to default retry attempts', () => {
    const wrapper = mountQueue({ retryAttempts: undefined });

    expect(wrapper.findAll('input[type="range"]')[1].attributes('value')).toBe('3');
    expect(wrapper.text()).toContain('settings.retryAttempts: 3');
  });

  it('warns above three concurrent downloads', async () => {
    expect(mountQueue().text()).not.toContain('settings.maxConcurrentWarning');

    const wrapper = mountQueue();
    await wrapper.findAll('input[type="range"]')[0].setValue('5');
    expect(h.settings.download.maxConcurrent).toBe(5);

    expect(wrapper.text()).toContain('settings.maxConcurrentWarning');
  });

  it('updates concurrency and retry attempts', async () => {
    const wrapper = mountQueue();
    const ranges = wrapper.findAll('input[type="range"]');

    await ranges[0].setValue('4');
    await ranges[1].setValue('5');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ maxConcurrent: 4 });
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ retryAttempts: 5 });
  });

  it('falls back to the default retry delay', () => {
    const wrapper = mountQueue({ retryBaseMs: undefined });

    expect(wrapper.get('select').attributes('value')).toBe('1500');
  });

  it('updates the retry base delay', async () => {
    const wrapper = mountQueue();
    const select = wrapper.get('select');

    expect(select.attributes('value')).toBe('1500');

    await select.setValue('3000');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ retryBaseMs: 3000 });
  });

  it('forwards every toggle', () => {
    const wrapper = mountQueue();
    const toggles = wrapper.findAllComponents(ToggleStub);

    expect(toggles).toHaveLength(4);
    toggles[0].vm.$emit('update:modelValue', false);
    toggles[1].vm.$emit('update:modelValue', true);
    toggles[2].vm.$emit('update:modelValue', true);
    toggles[3].vm.$emit('update:modelValue', true);

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ hashFiles: false });
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ autoDownloadSubscriptions: true });
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ nightScheduleEnabled: true });
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ autoAddDownloadFolder: true });
  });

  it('hides the night hours until the schedule is enabled', () => {
    expect(mountQueue().findAll('input[type="number"]')).toHaveLength(0);

    const wrapper = mountQueue({ nightScheduleEnabled: true });
    const hours = wrapper.findAll('input[type="number"]');

    expect(hours).toHaveLength(2);
    expect(hours[0].attributes('value')).toBe('22');
    expect(hours[1].attributes('value')).toBe('6');
  });

  it('updates the night schedule hours', async () => {
    const wrapper = mountQueue({ nightScheduleEnabled: true });
    const hours = wrapper.findAll('input[type="number"]');

    await hours[0].setValue('23');
    await hours[1].setValue('');
    await hours[0].setValue('0');

    expect(h.settings.updateDownload).toHaveBeenCalledWith({ nightScheduleStart: 23 });
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ nightScheduleEnd: 0 });
    expect(h.settings.updateDownload).toHaveBeenCalledWith({ nightScheduleStart: 0 });
  });
});
