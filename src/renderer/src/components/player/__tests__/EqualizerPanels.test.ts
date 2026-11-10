import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  setEqEnabled: vi.fn(),
  setEqMono: vi.fn(),
  setNightMode: vi.fn(),
  setEqSnap: vi.fn(),
  setEqMulticolor: vi.fn(),
  setEqPreamp: vi.fn(),
  setAudioDelay: vi.fn(),
  toggleSolo: vi.fn(),
  onCurveDown: vi.fn(),
  onCurveMove: vi.fn(),
  onCurveUp: vi.fn(),
  onCurveDblClick: vi.fn(),
  onMarkerDblClick: vi.fn(),
  onMarkerContext: vi.fn(),
  selectPreset: vi.fn(),
  setType: vi.fn(),
  patchBand: vi.fn(),
  addBand: vi.fn(),
  removeBand: vi.fn(),
  typeLabel: vi.fn((type: string) => `type:${type}`),
  savePreset: vi.fn(),
  confirmSavePreset: vi.fn(),
  deletePreset: vi.fn(),
  exportEq: vi.fn(),
  importEq: vi.fn(),
  state: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/composables/useEqualizerPanel', () => ({
  useEqualizerPanel: () => h.state
}));

const BandStub = defineComponent({
  name: 'EqBandRow',
  props: [
    'band',
    'index',
    'color',
    'soloed',
    'hovered',
    'canRemove',
    'snapEnabled',
    'bandTypes',
    'typeLabel'
  ],
  emits: ['patch', 'toggle-solo', 'remove', 'mouseenter', 'mouseleave'],
  template: `<button data-testid="band" @click="$emit('patch', { gain: 3 })"
    @dblclick="$emit('toggle-solo')"
    @contextmenu="$emit('remove')"
    @mouseenter="$emit('mouseenter')"
    @mouseleave="$emit('mouseleave')" />`
});
const PromptStub = defineComponent({
  name: 'ExplorerPromptDialog',
  props: ['visible', 'isConfirm', 'message', 'value'],
  emits: ['update:value', 'confirm', 'cancel'],
  template: `<div data-testid="prompt">
    <button data-testid="prompt-type" @click="$emit('update:value', 'typed')" />
    <button data-testid="prompt-confirm" @click="$emit('confirm')" />
    <button data-testid="prompt-cancel" @click="$emit('cancel')" />
  </div>`
});

import Equalizer from '../Equalizer.vue';

let wrapper: VueWrapper | null = null;

function band(frequency = 1000, type = 'peaking', gain = 0) {
  return { frequency, gain, type, enabled: true, q: 1 };
}

function setup() {
  h.state = {
    showControls: ref(true),
    menuBand: ref(null),
    fx: reactive({
      equalizerEnabled: false,
      equalizerMono: false,
      nightMode: false,
      equalizerSnap: false,
      equalizerMulticolor: false,
      equalizerPreamp: 0,
      audioDelayMs: 0
    }),
    audio: {
      setEqEnabled: h.setEqEnabled,
      setEqMono: h.setEqMono,
      setNightMode: h.setNightMode,
      setEqSnap: h.setEqSnap,
      setEqMulticolor: h.setEqMulticolor,
      setEqPreamp: h.setEqPreamp,
      setAudioDelay: h.setAudioDelay
    },
    prompt: {
      promptVisible: { value: false },
      promptIsConfirm: { value: false },
      promptMessage: { value: '' },
      promptValue: { value: '' },
      promptConfirm: vi.fn(),
      promptCancel: vi.fn()
    },
    bandTypes: ['peaking', 'lowshelf'],
    limits: { maxBands: 3 },
    presetLabels: { flat: 'Flat' },
    bands: ref([band(), band(200)]),
    color: (index: number) => `color-${index}`,
    solo: ref(null),
    toggleSolo: h.toggleSolo,
    userPresets: ref({ Mine: {} }),
    activePreset: ref('flat'),
    curvePath: 'M0 0',
    zeroLineY: 50,
    spectrumPath: 'M1 1',
    draggingBand: ref(null),
    hoverBand: ref(null),
    menuBelow: ref(false),
    onCurveDown: h.onCurveDown,
    onCurveMove: h.onCurveMove,
    onCurveUp: h.onCurveUp,
    onCurveDblClick: h.onCurveDblClick,
    onMarkerDblClick: h.onMarkerDblClick,
    onMarkerContext: h.onMarkerContext,
    selectPreset: h.selectPreset,
    setType: h.setType,
    patchBand: h.patchBand,
    addBand: h.addBand,
    removeBand: h.removeBand,
    typeLabel: h.typeLabel,
    naming: ref(false),
    presetName: ref(''),
    canSavePreset: ref(true),
    savePreset: h.savePreset,
    confirmSavePreset: h.confirmSavePreset,
    deletePreset: h.deletePreset,
    exportEq: h.exportEq,
    importEq: h.importEq
  };
  wrapper = mount(Equalizer, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { EqBandRow: BandStub, ExplorerPromptDialog: PromptStub }
    }
  });
  return wrapper;
}

function markers() {
  return wrapper!.findAll('.w-5.h-5');
}

beforeEach(() => {
  for (const fn of [
    h.setEqEnabled,
    h.setEqMono,
    h.setNightMode,
    h.setEqSnap,
    h.setEqMulticolor,
    h.setEqPreamp,
    h.setAudioDelay,
    h.toggleSolo,
    h.onCurveDown,
    h.onCurveMove,
    h.onCurveUp,
    h.onCurveDblClick,
    h.onMarkerDblClick,
    h.onMarkerContext,
    h.selectPreset,
    h.setType,
    h.patchBand,
    h.addBand,
    h.removeBand,
    h.savePreset,
    h.confirmSavePreset,
    h.deletePreset,
    h.exportEq,
    h.importEq
  ]) {
    fn.mockReset();
  }
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('toggles and sliders', () => {
  it('flips every audio toggle', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-power"]').trigger('click');
    await wrapper!.get('[data-testid="eq-mono"]').trigger('click');
    await wrapper!.get('[data-testid="eq-night"]').trigger('click');
    await wrapper!.get('[data-testid="eq-snap"]').trigger('click');
    await wrapper!.get('[data-testid="eq-multicolor"]').trigger('click');

    expect(h.setEqEnabled).toHaveBeenCalledWith(true);
    expect(h.setEqMono).toHaveBeenCalledWith(true);
    expect(h.setNightMode).toHaveBeenCalledWith(true);
    expect(h.setEqSnap).toHaveBeenCalledWith(true);
    expect(h.setEqMulticolor).toHaveBeenCalledWith(true);
  });

  it('updates preamp and audio delay', async () => {
    setup();
    const preamp = wrapper!.get('[data-testid="eq-preamp"]');
    const delay = wrapper!.get('[data-testid="eq-audio-delay"]');
    (preamp.element as HTMLInputElement).value = '4';
    (delay.element as HTMLInputElement).value = '120';

    await preamp.trigger('input');
    await delay.trigger('input');

    expect(h.setEqPreamp).toHaveBeenCalledWith(4);
    expect(h.setAudioDelay).toHaveBeenCalledWith(120);
  });

  it('toggles controls and resets to flat', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-toggle-controls"]').trigger('click');
    expect(h.state.showControls.value).toBe(false);

    await wrapper!.get('[aria-label="equalizer.reset"]').trigger('click');
    expect(h.selectPreset).toHaveBeenCalledWith('flat');
  });

  it('adds bands until the limit', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-add-band"]').trigger('click');
    expect(h.addBand).toHaveBeenCalledTimes(1);

    h.state.bands.value = [band(), band(), band()];
    await wrapper!.vm.$nextTick();

    expect(wrapper!.get('[data-testid="eq-add-band"]').attributes('disabled')).toBeDefined();
    await wrapper!.get('[data-testid="eq-add-band"]').trigger('click');
    expect(h.addBand).toHaveBeenCalledTimes(1);
  });
});

describe('presets', () => {
  it('selects built-in and user presets, and deletes on right click', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-preset-flat"]').trigger('click');
    await wrapper!.get('[data-testid="eq-user-preset-Mine"]').trigger('click');
    await wrapper!.get('[data-testid="eq-user-preset-Mine"]').trigger('contextmenu');

    expect(h.selectPreset).toHaveBeenNthCalledWith(1, 'flat');
    expect(h.selectPreset).toHaveBeenNthCalledWith(2, 'Mine');
    expect(h.deletePreset).toHaveBeenCalledWith('Mine');
  });

  it('shows the custom badge', async () => {
    setup();
    h.state.activePreset.value = 'custom';
    await wrapper!.vm.$nextTick();

    expect(wrapper!.find('[data-testid="eq-preset-custom"]').exists()).toBe(true);
  });

  it('triggers save, export and import', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-save-preset"]').trigger('click');
    await wrapper!.get('[data-testid="eq-export"]').trigger('click');
    await wrapper!.get('[data-testid="eq-import"]').trigger('click');

    expect(h.savePreset).toHaveBeenCalled();
    expect(h.exportEq).toHaveBeenCalled();
    expect(h.importEq).toHaveBeenCalled();
  });
});

describe('preset naming', () => {
  it('edits, confirms with Enter and cancels with the button', async () => {
    setup();
    h.state.naming.value = true;
    await wrapper!.vm.$nextTick();

    const input = wrapper!.get('[data-testid="eq-preset-name-input"]');
    await input.setValue('My EQ');
    expect(h.state.presetName.value).toBe('My EQ');

    await input.trigger('keydown', { key: 'Enter' });
    expect(h.confirmSavePreset).toHaveBeenCalledTimes(1);

    await wrapper!.get('[data-testid="eq-preset-name-confirm"]').trigger('click');
    expect(h.confirmSavePreset).toHaveBeenCalledTimes(2);

    await wrapper!.get('[data-testid="eq-preset-name-cancel"]').trigger('click');
    expect(h.state.naming.value).toBe(false);
  });

  it('closes naming on Escape and disables the confirm when needed', async () => {
    setup();
    h.state.naming.value = true;
    h.state.canSavePreset.value = false;
    await wrapper!.vm.$nextTick();

    expect(
      wrapper!.get('[data-testid="eq-preset-name-confirm"]').attributes('disabled')
    ).toBeDefined();

    await wrapper!.get('[data-testid="eq-preset-name"]').trigger('keydown', { key: 'Escape' });
    expect(h.state.naming.value).toBe(false);
  });
});

describe('curve and markers', () => {
  it('forwards curve double click', async () => {
    setup();
    await wrapper!.get('[data-testid="eq-curve"]').trigger('dblclick');
    expect(h.onCurveDblClick).toHaveBeenCalled();
  });

  it('wires marker pointer, double click, context and hover events', async () => {
    setup();
    const marker = markers()[0];

    await marker.trigger('pointerdown');
    await marker.trigger('pointermove');
    await marker.trigger('pointerup');
    await marker.trigger('pointercancel');
    await marker.trigger('dblclick');
    await marker.trigger('contextmenu');
    await marker.trigger('mouseenter');
    expect(h.state.hoverBand.value).toBe(0);

    await marker.trigger('mouseleave');
    expect(h.state.hoverBand.value).toBeNull();

    expect(h.onCurveDown).toHaveBeenCalledWith(0, expect.any(Event));
    expect(h.onCurveMove).toHaveBeenCalled();
    expect(h.onCurveUp).toHaveBeenCalledTimes(2);
    expect(h.onMarkerDblClick).toHaveBeenCalledWith(0);
    expect(h.onMarkerContext).toHaveBeenCalledWith(expect.any(Event), 0);
  });

  it('changes band type and removes bands from the context menu', async () => {
    setup();
    h.state.menuBand.value = 0;
    await wrapper!.vm.$nextTick();

    const typeButtons = wrapper!
      .findAll('button')
      .filter((button) => button.text().startsWith('type:'));
    await typeButtons[1].trigger('click');
    expect(h.setType).toHaveBeenCalledWith(0, 'lowshelf');

    const remove = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'equalizer.removeBand')!;
    await remove.trigger('click');
    expect(h.removeBand).toHaveBeenCalledWith(0);
  });

  it('disables band removal for a single band', async () => {
    setup();
    h.state.bands.value = [band()];
    h.state.menuBand.value = 0;
    await wrapper!.vm.$nextTick();

    const remove = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'equalizer.removeBand')!;
    expect(remove.attributes('disabled')).toBeDefined();
  });
});

describe('band rows and prompt', () => {
  it('forwards band row events', async () => {
    setup();
    const rows = wrapper!.findAll('[data-testid="band"]');

    await rows[0].trigger('click');
    await rows[0].trigger('dblclick');
    await rows[0].trigger('contextmenu');
    await rows[0].trigger('mouseenter');
    await rows[0].trigger('mouseleave');

    expect(h.patchBand).toHaveBeenCalledWith(0, { gain: 3 });
    expect(h.toggleSolo).toHaveBeenCalledWith(0);
    expect(h.removeBand).toHaveBeenCalledWith(0);
    expect(h.state.hoverBand.value).toBeNull();
  });

  it('wires the prompt dialog', async () => {
    setup();

    await wrapper!.get('[data-testid="prompt-type"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-confirm"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-cancel"]').trigger('click');

    expect(h.state.prompt.promptValue.value).toBe('typed');
    expect(h.state.prompt.promptConfirm).toHaveBeenCalled();
    expect(h.state.prompt.promptCancel).toHaveBeenCalled();
  });
});
