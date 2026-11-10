import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  updateExplorer: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: { title: String, description: String },
  template: '<section :data-title="title"><slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: { label: String, description: String },
  template: '<div :data-label="label">{{ description }}<slot /></div>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template:
    '<button :data-model="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)" />'
});

import SettingsExplorer from '../SettingsExplorer.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(SettingsExplorer, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub, SettingsRow: RowStub, SettingsToggle: ToggleStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.updateExplorer = vi.fn();
  h.settings = reactive({
    explorer: {
      viewMode: 'small',
      sortBy: 'name',
      sortOrder: 'asc',
      showHidden: false,
      confirmBeforeMove: true,
      permanentDelete: false
    },
    updateExplorer: h.updateExplorer
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('view modes', () => {
  it('marks the active mode and updates on click', async () => {
    setup();
    const buttons = wrapper!.findAll('button[data-model], button');
    const viewButtons = wrapper!.findAll('section[data-title="settings.viewMode"] button');

    expect(viewButtons).toHaveLength(6);
    const active = viewButtons.find((button) => button.text() === 'settings.viewMode_small')!;
    expect(active.classes()).toContain('bg-primary');
    expect(buttons.length).toBeGreaterThanOrEqual(6);

    await viewButtons[0].trigger('click');
    expect(h.updateExplorer).toHaveBeenCalledWith({ viewMode: 'extraSmall' });
  });
});

describe('sorting', () => {
  it('updates sortBy from valid options only', async () => {
    setup();
    const select = wrapper!.findAll('select')[0];
    (select.element as HTMLSelectElement).value = 'size';
    await select.trigger('change');
    expect(h.updateExplorer).toHaveBeenCalledWith({ sortBy: 'size' });

    (select.element as HTMLSelectElement).value = 'bogus';
    await select.trigger('change');
    expect(h.updateExplorer).toHaveBeenLastCalledWith({ sortBy: 'name' });
  });

  it('updates sortOrder from valid options only', async () => {
    setup();
    const select = wrapper!.findAll('select')[1];
    (select.element as HTMLSelectElement).value = 'desc';
    await select.trigger('change');
    expect(h.updateExplorer).toHaveBeenCalledWith({ sortOrder: 'desc' });

    (select.element as HTMLSelectElement).value = 'sideways';
    await select.trigger('change');
    expect(h.updateExplorer).toHaveBeenLastCalledWith({ sortOrder: 'asc' });
  });
});

describe('toggles', () => {
  it('passes explorer flags through', async () => {
    setup();
    const toggles = wrapper!.findAllComponents(ToggleStub);
    expect(toggles.map((toggle) => toggle.props('modelValue'))).toEqual([false, true, false]);

    await toggles[0].trigger('click');
    await toggles[1].trigger('click');
    await toggles[2].trigger('click');

    expect(h.updateExplorer).toHaveBeenNthCalledWith(1, { showHidden: true });
    expect(h.updateExplorer).toHaveBeenNthCalledWith(2, { confirmBeforeMove: false });
    expect(h.updateExplorer).toHaveBeenNthCalledWith(3, { permanentDelete: true });
  });
});

describe('layout', () => {
  it('renders the three settings groups', () => {
    setup();
    const titles = wrapper!.findAll('section').map((section) => section.attributes('data-title'));
    expect(titles).toEqual(['settings.viewMode', 'settings.sorting', undefined]);
    expect(wrapper!.text()).toContain('settings.sortByName');
    expect(wrapper!.text()).toContain('settings.showHiddenDesc');
  });
});
