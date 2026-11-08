import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import AudioVizSettings from '../AudioVizSettings.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));

const ButtonStub = defineComponent({
  props: {
    variant: String,
    size: String,
    label: String,
    title: String
  },
  emits: ['click'],
  template: '<button :aria-label="label" :title="title" @click="$emit(\'click\')"><slot /></button>'
});

let wrapper: VueWrapper | null = null;

function viz(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'bars',
    primaryColor: '#112233',
    secondaryColor: '#445566',
    sensitivity: 0.5,
    smoothing: 0.4,
    fpsCap: 60,
    ...overrides
  };
}

function mountView() {
  wrapper = mount(AudioVizSettings, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Button: ButtonStub }
    }
  });
  return wrapper;
}

function buttonsByText() {
  return wrapper!.findAll('button');
}

beforeEach(() => {
  setActivePinia(createPinia());
  state.settings = reactive({
    playback: { visualization: viz() },
    appearance: { audioLayout: { hudOpacity: 80, vizQuality: 'medium' } },
    updatePlayback: vi.fn(),
    updateAppearance: vi.fn()
  });
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('modes', () => {
  it('renders every visualization mode and marks the active one', () => {
    mountView();
    const modes = [
      'audioView.vizModeSplash',
      'audioView.vizModeBars',
      'audioView.vizModeSpectrum',
      'audioView.vizModeWave',
      'audioView.vizModeRadial',
      'audioView.vizModeRings',
      'audioView.vizModeCircle',
      'audioView.vizModeParticles',
      'audioView.vizModeNone'
    ];
    const modeButtons = buttonsByText().filter((b) => modes.some((m) => b.text() === m));
    expect(modeButtons).toHaveLength(9);
    const active = modeButtons.find((b) => b.text() === 'audioView.vizModeBars')!;
    expect(active.attributes('aria-pressed')).toBe('true');
    expect(active.classes()).toContain('bg-primary');
    expect(modeButtons[0].attributes('aria-pressed')).toBe('false');
  });

  it('updates the mode while preserving other settings', async () => {
    mountView();
    await buttonsByText()
      .find((b) => b.text() === 'audioView.vizModeRings')!
      .trigger('click');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: viz({ mode: 'rings' })
    });
  });
});

describe('colours and sliders', () => {
  it('renders colours and updates them independently', async () => {
    mountView();
    const colors = wrapper!.findAll('input[type="color"]');
    expect(colors).toHaveLength(2);
    expect(colors[0].attributes('value')).toBe('#112233');
    expect(colors[0].attributes('aria-label')).toBe('audioView.vizPrimaryColor');
    expect(colors[1].attributes('value')).toBe('#445566');
    expect(wrapper!.text()).toContain('#112233');
    expect(wrapper!.text()).toContain('#445566');

    await colors[0].setValue('#ffffff');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: viz({ primaryColor: '#ffffff' })
    });

    await colors[1].setValue('#000000');
    expect(state.settings.updatePlayback).toHaveBeenLastCalledWith({
      visualization: viz({ secondaryColor: '#000000' })
    });
  });

  it('renders percentages and updates sensitivity and smoothing', async () => {
    mountView();
    const ranges = wrapper!.findAll('input[type="range"]');
    expect(ranges[0].attributes('value')).toBe('0.5');
    expect(ranges[0].attributes('min')).toBe('0.1');
    expect(ranges[1].attributes('value')).toBe('0.4');
    expect(wrapper!.text()).toContain('50%');
    expect(wrapper!.text()).toContain('40%');

    await ranges[0].setValue('0.75');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: viz({ sensitivity: 0.75 })
    });
    await ranges[1].setValue('0.2');
    expect(state.settings.updatePlayback).toHaveBeenLastCalledWith({
      visualization: viz({ smoothing: 0.2 })
    });
  });
});

describe('fps options', () => {
  it('offers the standard fps presets', () => {
    mountView();
    const labels = buttonsByText()
      .map((b) => b.text())
      .filter((text) => ['30', '60', '90', '120'].includes(text));
    expect(labels).toEqual(['30', '60', '90', '120']);
    const active = buttonsByText().find((b) => b.text() === '60')!;
    expect(active.attributes('aria-pressed')).toBe('true');
  });

  it('appends and sorts custom fps values', () => {
    state.settings.playback.visualization = viz({ fpsCap: 45 });
    mountView();
    const labels = buttonsByText()
      .map((b) => b.text())
      .filter((text) => ['30', '45', '60', '90', '120'].includes(text));
    expect(labels).toEqual(['30', '45', '60', '90', '120']);
    expect(
      buttonsByText()
        .find((b) => b.text() === '45')!
        .attributes('aria-pressed')
    ).toBe('true');
  });

  it('updates the fps cap', async () => {
    mountView();
    await buttonsByText()
      .find((b) => b.text() === '120')!
      .trigger('click');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: viz({ fpsCap: 120 })
    });
  });
});

describe('hud opacity', () => {
  it('edits locally and commits to the layout on change', async () => {
    mountView();
    const ranges = wrapper!.findAll('input[type="range"]');
    const opacity = ranges[2];
    expect((opacity.element as HTMLInputElement).value).toBe('80');
    expect(wrapper!.text()).toContain('80%');

    await opacity.setValue('55');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      audioLayout: { hudOpacity: 55, vizQuality: 'medium' }
    });
  });

  it('defaults to 100 when no layout exists', () => {
    state.settings.appearance.audioLayout = null;
    mountView();
    const opacity = wrapper!.findAll('input[type="range"]')[2];
    expect((opacity.element as HTMLInputElement).value).toBe('100');
    expect(wrapper!.text()).toContain('100%');
  });

  it('tracks external layout changes', async () => {
    mountView();
    state.settings.appearance.audioLayout = { hudOpacity: 35, vizQuality: 'low' };
    await wrapper!.vm.$nextTick();
    const opacity = wrapper!.findAll('input[type="range"]')[2];
    expect((opacity.element as HTMLInputElement).value).toBe('35');
  });
});

describe('quality', () => {
  it('renders quality labels and the active value', () => {
    mountView();
    const labels = [
      'audioView.vizQualityLow',
      'audioView.vizQualityMedium',
      'audioView.vizQualityHigh'
    ];
    const qualityButtons = buttonsByText().filter((b) => labels.includes(b.text()));
    expect(qualityButtons).toHaveLength(3);
    expect(qualityButtons[1].attributes('aria-pressed')).toBe('true');
    expect(state.t).toHaveBeenCalledWith('audioView.vizQualityMedium');
  });

  it('defaults to high quality and updates the layout', async () => {
    state.settings.appearance.audioLayout = null;
    mountView();
    const low = buttonsByText().find((b) => b.text() === 'audioView.vizQualityLow')!;
    expect(low.attributes('aria-pressed')).toBe('false');
    await low.trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      audioLayout: { vizQuality: 'low' }
    });
  });
});

describe('closing', () => {
  it('emits close from the close button', async () => {
    mountView();
    const close = wrapper!.get('[data-testid="viz-settings-close"]');
    expect(close.attributes('aria-label')).toBe('common.close');
    await close.trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('closes on Escape and removes the listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    mountView();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper!.emitted('close')).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(wrapper!.emitted('close')).toHaveLength(1);

    wrapper!.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
