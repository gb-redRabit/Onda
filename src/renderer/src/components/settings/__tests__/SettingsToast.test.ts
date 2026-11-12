import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  toast: null as any,
  updateToast: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => ({ toast: h.toast, updateToast: h.updateToast })
}));

import SettingsToast from '../SettingsToast.vue';

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: ['title'],
  template: '<section><slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: ['label', 'description'],
  template: '<div class="row" :data-label="label"><slot /></div>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<button class="toggle" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />'
});
const GridStub = defineComponent({
  name: 'SettingsPositionGrid',
  props: ['modelValue', 'options', 'selectedLabel'],
  emits: ['update:modelValue'],
  template: '<div data-testid="grid" />'
});

let wrapper: VueWrapper | null = null;

function mountToast() {
  wrapper = mount(SettingsToast, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub,
        SettingsPositionGrid: GridStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.toast = reactive({
    position: 'bottom-right',
    showSuccess: true,
    showInfo: true,
    showWarning: true,
    showNative: false
  });
  h.updateToast.mockClear();
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('position grid', () => {
  it('passes translated options and the selected label', () => {
    mountToast();

    const grid = wrapper!.findComponent(GridStub);
    expect(grid.props('modelValue')).toBe('bottom-right');
    expect(grid.props('options')).toEqual([
      { id: 'top-left', label: 'settings.topLeft', icon: expect.anything() },
      { id: 'top-right', label: 'settings.topRight', icon: expect.anything() },
      { id: 'bottom-left', label: 'settings.bottomLeft', icon: expect.anything() },
      { id: 'bottom-right', label: 'settings.bottomRight', icon: expect.anything() }
    ]);
    expect(grid.props('selectedLabel')).toBe('settings.bottomRight');
  });

  it('persists a new position', () => {
    mountToast();

    wrapper!.findComponent(GridStub).vm.$emit('update:modelValue', 'top-left');

    expect(h.updateToast).toHaveBeenCalledWith({ position: 'top-left' });
  });

  it('uses an empty selected label for an unknown position', () => {
    h.toast.position = 'somewhere';
    mountToast();

    expect(wrapper!.findComponent(GridStub).props('selectedLabel')).toBe('');
  });
});

describe('toast type toggles', () => {
  it('updates each configurable type', async () => {
    mountToast();
    const toggles = wrapper!.findAllComponents(ToggleStub);

    await toggles[0].trigger('click');
    await toggles[1].trigger('click');
    await toggles[2].trigger('click');
    await toggles[4].trigger('click');

    expect(h.updateToast).toHaveBeenCalledWith({ showSuccess: false });
    expect(h.updateToast).toHaveBeenCalledWith({ showInfo: false });
    expect(h.updateToast).toHaveBeenCalledWith({ showWarning: false });
    expect(h.updateToast).toHaveBeenCalledWith({ showNative: true });
  });

  it('keeps errors always enabled', () => {
    mountToast();
    const errors = wrapper!.findAllComponents(ToggleStub)[3];

    expect(errors.props('modelValue')).toBe(true);
    expect(errors.attributes('disabled')).toBeDefined();
  });

  it('renders every type row', () => {
    mountToast();

    const labels = wrapper!.findAllComponents(RowStub).map((row) => row.props('label'));
    expect(labels).toEqual([
      'settings.toastSuccess',
      'settings.toastInfo',
      'settings.toastWarn',
      'settings.toastErrors',
      'settings.toastNative'
    ]);
  });
});
