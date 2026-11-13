import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  presets: [
    { id: 'flat', label: 'Flat' },
    { id: 'bass', label: 'Bass' },
    { id: 'vocal', label: 'Vocal' },
    { id: 'rock', label: 'Rock' },
    { id: 'jazz', label: 'Jazz' }
  ]
}));

vi.mock('../usePipAudioState', () => ({ EQ_PRESETS: h.presets }));
vi.mock('../pipTheme', () => ({
  EQ_BTN: 'eq-btn',
  EQ_BTN_ON: 'eq-btn-on',
  VOL_LABEL: 'vol-label'
}));

import PipEqPresets from '../PipEqPresets.vue';
import PipVolume from '../PipVolume.vue';

describe('PipEqPresets', () => {
  it('renders the first four presets', () => {
    const wrapper = mount(PipEqPresets, {
      props: { eqPreset: 'bass', selectEqPreset: vi.fn() }
    });
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.text())).toEqual(['Flat', 'Bass', 'Vocal', 'Rock']);
    expect(buttons[0].attributes('data-testid')).toBe('pip-eq-flat');
  });

  it('marks the active preset', () => {
    const wrapper = mount(PipEqPresets, {
      props: { eqPreset: 'bass', selectEqPreset: vi.fn() }
    });

    expect(wrapper.get('[data-testid="pip-eq-bass"]').classes()).toContain('eq-btn-on');
    expect(wrapper.get('[data-testid="pip-eq-bass"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-testid="pip-eq-flat"]').classes()).not.toContain('eq-btn-on');
    expect(wrapper.get('[data-testid="pip-eq-flat"]').attributes('aria-pressed')).toBe('false');
  });

  it('selects a preset on click', async () => {
    const selectEqPreset = vi.fn();
    const wrapper = mount(PipEqPresets, { props: { eqPreset: 'flat', selectEqPreset } });

    await wrapper.get('[data-testid="pip-eq-vocal"]').trigger('click');

    expect(selectEqPreset).toHaveBeenCalledWith('vocal');
  });
});

describe('PipVolume', () => {
  function props(over: Record<string, unknown> = {}) {
    return {
      send: vi.fn(),
      volume: 0.5,
      volLabel: '🔊',
      volPct: '50%',
      onVolumeInput: vi.fn(),
      ...over
    };
  }

  it('renders the horizontal slider with the percentage by default', () => {
    const wrapper = mount(PipVolume, { props: props() });
    const input = wrapper.get('[data-testid="pip-volume"]');

    expect(wrapper.text()).toContain('🔊');
    expect(wrapper.text()).toContain('50%');
    expect(wrapper.classes()).not.toContain('flex-col');
    expect(input.classes()).toContain('w-16');
    expect(input.attributes('min')).toBe('0');
    expect(input.attributes('max')).toBe('1');
    expect(input.attributes('step')).toBe('0.05');
    expect(input.attributes('value')).toBe('0.5');
  });

  it('uses the mute label that matches the muted state', () => {
    const off = mount(PipVolume, { props: props() });
    expect(off.get('[data-testid="pip-mute"]').attributes('aria-label')).toBe('Mute');
    expect(off.get('[data-testid="pip-mute"]').attributes('aria-pressed')).toBe('false');

    const on = mount(PipVolume, { props: props({ muted: true }) });
    expect(on.get('[data-testid="pip-mute"]').attributes('aria-label')).toBe('Unmute');
    expect(on.get('[data-testid="pip-mute"]').attributes('aria-pressed')).toBe('true');
  });

  it('sends the mute action', async () => {
    const send = vi.fn();
    const wrapper = mount(PipVolume, { props: props({ send }) });

    await wrapper.get('[data-testid="pip-mute"]').trigger('click');

    expect(send).toHaveBeenCalledWith('mute');
  });

  it('forwards volume input events', async () => {
    const onVolumeInput = vi.fn();
    const wrapper = mount(PipVolume, { props: props({ onVolumeInput }) });

    await wrapper.get('[data-testid="pip-volume"]').trigger('input');

    expect(onVolumeInput).toHaveBeenCalledWith(expect.any(Event));
  });

  it('supports vertical layout, custom slider styles and hidden percent', () => {
    const wrapper = mount(PipVolume, {
      props: props({ layout: 'vertical', sliderClass: 'w-8', showPct: false })
    });

    expect(wrapper.classes()).toContain('flex-col');
    expect(wrapper.get('[data-testid="pip-volume"]').classes()).toContain('w-8');
    expect(wrapper.text()).not.toContain('50%');
  });

  it('keeps the percent visible in vertical layout without right alignment', () => {
    const wrapper = mount(PipVolume, { props: props({ layout: 'vertical' }) });
    const pct = wrapper.findAll('span').at(-1)!;

    expect(wrapper.classes()).toContain('flex-col');
    expect(pct.text()).toBe('50%');
    expect(pct.classes()).not.toContain('min-w-5');
  });

  it('keeps the label styling hook', () => {
    const wrapper = mount(PipVolume, { props: props() });

    expect(wrapper.get('[data-testid="pip-mute"]').classes()).toContain('vol-label');
  });
});

beforeEach(() => {
  h.presets.length = 5;
});
