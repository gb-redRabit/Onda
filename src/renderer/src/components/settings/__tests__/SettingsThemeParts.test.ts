import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';

vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => state.settings
}));

const state = vi.hoisted(() => ({ settings: null as any }));

import SettingsThemePicker from '../SettingsThemePicker.vue';
import SettingsThemeGeometry from '../SettingsThemeGeometry.vue';

const SliderStub = {
  name: 'Slider',
  props: {
    modelValue: { type: Number },
    label: { type: String },
    min: { type: Number },
    max: { type: Number },
    step: { type: Number },
    disabled: { type: Boolean },
    valueText: { type: String }
  },
  emits: ['update:modelValue'],
  template:
    '<div data-testid="slider" :data-label="label" :data-value="modelValue" :data-disabled="String(disabled)" :data-value-text="valueText" />'
};

function mountPicker(theme = 'system') {
  state.settings = reactive({
    appearance: { theme, colors: {} },
    updateAppearance: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(state.settings.appearance, patch)
    )
  });
  return mount(SettingsThemePicker, {
    global: { mocks: { $t: (key: string) => key } }
  });
}

beforeEach(() => {
  state.settings = null;
});

describe('SettingsThemePicker', () => {
  it('lists system, built-in and custom themes', () => {
    const wrapper = mountPicker();
    const buttons = wrapper.findAll('button');

    expect(buttons.length).toBeGreaterThanOrEqual(3);
    expect(wrapper.find('[data-testid="theme-system"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-custom"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('settings.system');
    expect(wrapper.text()).toContain('settings.custom');
  });

  it('highlights the active theme', () => {
    const wrapper = mountPicker('system');
    const system = wrapper.get('[data-testid="theme-system"]');
    const custom = wrapper.get('[data-testid="theme-custom"]');

    expect(system.classes()).toContain('border-primary');
    expect(custom.classes()).toContain('border-hairline');
  });

  it('highlights a custom theme', () => {
    expect(mountPicker('custom').get('[data-testid="theme-custom"]').classes()).toContain(
      'border-primary'
    );
  });

  it('selects system and custom themes', async () => {
    const wrapper = mountPicker('system');

    await wrapper.get('[data-testid="theme-custom"]').trigger('click');
    await wrapper.get('[data-testid="theme-system"]').trigger('click');

    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ theme: 'custom' });
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ theme: 'system' });
  });

  it('selects a built-in theme', async () => {
    const wrapper = mountPicker();
    const builtin = wrapper
      .findAll('button')
      .find(
        (b) =>
          b.attributes('data-testid')?.startsWith('theme-') &&
          !['theme-system', 'theme-custom'].includes(b.attributes('data-testid')!)
      )!;

    await builtin.trigger('click');

    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      theme: builtin.attributes('data-testid')!.replace('theme-', '')
    });
  });
});

function mountGeometry(appearance: Record<string, unknown> = {}) {
  state.settings = reactive({
    appearance: { ...appearance },
    updateAppearance: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(state.settings.appearance, patch)
    )
  });
  return mount(SettingsThemeGeometry, {
    global: { mocks: { $t: (key: string) => key }, stubs: { Slider: SliderStub } }
  });
}

describe('SettingsThemeGeometry', () => {
  it('renders default geometry values', () => {
    const wrapper = mountGeometry();
    const sliders = wrapper.findAllComponents(SliderStub);

    expect(sliders.length).toBe(8);
    expect(wrapper.text()).toContain('creator.geometry');
    expect(sliders.map((s) => s.attributes('data-label'))).toEqual([
      'creator.radiusBox',
      'creator.radiusField',
      'creator.radiusSelector',
      'creator.sizeField',
      'creator.sizeSelector',
      'creator.borderWidth',
      'creator.depth',
      'creator.noise'
    ]);
  });

  it('uses stored geometry values', () => {
    const wrapper = mountGeometry({ geometry: { radiusBox: 7, border: 2 }, glassAlpha: 100 });
    const sliders = wrapper.findAllComponents(SliderStub);

    expect(sliders[0].attributes('data-value')).toBe('7');
    expect(sliders[5].attributes('data-value')).toBe('2');
  });

  it('locks the box radius while glass is active', () => {
    const wrapper = mountGeometry({ glassAlpha: 50, geometry: { radiusBox: 9 } });
    const slider = wrapper.findAllComponents(SliderStub)[0];

    expect(slider.attributes('data-value')).toBe('0');
    expect(slider.attributes('data-disabled')).toBe('true');
    expect(wrapper.text()).toContain('creator.glassLocked');
  });

  it('merges geometry updates when none are stored', () => {
    const wrapper = mountGeometry();
    const slider = wrapper.findAllComponents(SliderStub)[0];

    slider.vm.$emit('update:modelValue', 5);

    expect(state.settings.appearance.geometry).toEqual({ radiusBox: 5 });
  });

  it('merges geometry updates for every slider', () => {
    const wrapper = mountGeometry({ geometry: { border: 1 } });
    const sliders = wrapper.findAllComponents(SliderStub);
    const values = [12, 9, 9, 3, 3, 2, 1.5, 0.3];

    sliders.forEach((slider, index) => slider.vm.$emit('update:modelValue', values[index]));

    expect(state.settings.updateAppearance).toHaveBeenCalledTimes(8);
    expect(state.settings.appearance.geometry).toMatchObject({
      radiusBox: 12,
      radiusField: 9,
      radiusSelector: 9,
      sizeField: 3,
      sizeSelector: 3,
      border: 2,
      depth: 1.5,
      noise: 0.3
    });
  });

  it('formats size, depth and noise values', () => {
    const wrapper = mountGeometry({ geometry: { depth: 1.25, noise: 0.4 } });
    const sliders = wrapper.findAllComponents(SliderStub);

    expect(sliders[4].attributes('data-value-text')).toBe('×2');
    expect(sliders[6].attributes('data-value-text')).toBe('1.3×');
    expect(sliders[7].attributes('data-value-text')).toBe('40%');
    expect(wrapper.text()).toContain('1.3×');
    expect(wrapper.text()).toContain('40%');
  });
});
