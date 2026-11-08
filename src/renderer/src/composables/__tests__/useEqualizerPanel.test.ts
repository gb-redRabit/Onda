import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useEqualizerPanel } from '../useEqualizerPanel';

const state = vi.hoisted(() => ({
  player: null as any,
  fx: null as any,
  audio: null as any,
  ui: null as any,
  prompt: null as any,
  applyEqBands: vi.fn(),
  applyEqGraph: vi.fn(),
  setVizActive: vi.fn(),
  setUserPresets: vi.fn(),
  setPreamp: vi.fn(),
  cloneBands: vi.fn((bands: any[]) => bands.map((band) => ({ ...band }))),
  matches: vi.fn(),
  snapFrequency: vi.fn((frequency: number) => Math.round(frequency / 10) * 10),
  eqBandColor: vi.fn((index: number) => `color-${index}`),
  curvePath: vi.fn(
    (bands: any[], _curve: any, preamp: number) => `curve-${bands.length}-${preamp}`
  ),
  ratioToFreq: vi.fn((ratio: number, min: number, max: number) => min + ratio * (max - min)),
  bandY: vi.fn((gain: number) => gain + 50),
  dbToY: vi.fn((db: number) => 100 - db),
  spectrumPath: null as any,
  sanitizeBands: vi.fn(),
  sanitizePreamp: vi.fn(),
  t: vi.fn((key: string) => key),
  presets: {
    flat: [{ type: 'peaking', frequency: 1000, q: 1, gain: 0 }],
    rock: [{ type: 'peaking', frequency: 1000, q: 1, gain: 4 }]
  } as Record<string, any[]>,
  curve: { minFreq: 20, maxFreq: 20000, minDb: -12, maxDb: 12 }
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => state.fx }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('../useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    ...state.audio,
    applyEqBands: state.applyEqBands,
    applyEqGraph: state.applyEqGraph,
    setVizActive: state.setVizActive,
    setEqUserPresets: state.setUserPresets,
    setEqPreamp: state.setPreamp
  })
}));
vi.mock('@renderer/utils/constants/audio', () => ({
  EQUALIZER_PRESETS: state.presets,
  EQUALIZER_PRESET_LABELS: { flat: 'Flat label', rock: 'Rock label' },
  EQ_LIMITS: { maxBands: 4 },
  cloneEqBands: state.cloneBands,
  eqBandColor: state.eqBandColor,
  matchesEqPreset: state.matches,
  snapFrequency: state.snapFrequency
}));
vi.mock('@shared/eqSanitize', () => ({
  sanitizeEqBands: state.sanitizeBands,
  sanitizeEqPreamp: state.sanitizePreamp
}));
vi.mock('@renderer/utils/eqCurve', () => ({
  eqCurvePath: state.curvePath,
  ratioToFreq: state.ratioToFreq
}));
vi.mock('@renderer/utils/eqGeometry', () => ({
  EQ_CURVE: state.curve,
  bandY: state.bandY,
  dbToY: state.dbToY
}));
vi.mock('../useEqSpectrum', () => ({
  useEqSpectrum: () => ({ spectrumPath: state.spectrumPath })
}));
vi.mock('../usePromptDialog', () => ({
  usePromptDialog: () => state.prompt
}));

type Panel = ReturnType<typeof useEqualizerPanel>;

let wrapper: VueWrapper | null = null;
let exposed: Panel;
let panelEl: HTMLElement;
let curveEl: HTMLElement;

function band(frequency: number, gain = 0, type = 'peaking') {
  return { type, frequency, q: 1, gain } as any;
}

function setup(curve: HTMLElement | null = curveEl) {
  const Comp = defineComponent({
    setup() {
      exposed = useEqualizerPanel({
        panel: ref(panelEl) as never,
        curveEl: ref(curve) as never
      });
      return () => h('div');
    }
  });
  wrapper = mount(Comp, { attachTo: document.body });
  return wrapper;
}

function pointerEvent(x: number, y: number, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent('pointerdown', {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true
  });
  Object.assign(event, extra);
  return event;
}

beforeEach(() => {
  panelEl = document.createElement('div');
  curveEl = document.createElement('div');
  curveEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  document.body.appendChild(panelEl);
  document.body.appendChild(curveEl);

  state.player = reactive({ isPlaying: true });
  state.fx = reactive({
    equalizerVisible: true,
    equalizerBands: [band(100, -3, 'lowshelf'), band(1000, 0), band(10000, 3, 'highshelf')],
    equalizerMulticolor: false,
    equalizerSnap: true,
    equalizerPreamp: 0,
    equalizerPreset: 'custom',
    equalizerUserPresets: { mine: [band(5000, 2)] }
  });
  state.audio = {
    getAnalyserNode: vi.fn(),
    getAudioContext: vi.fn()
  };
  state.ui = { notify: vi.fn() };
  state.prompt = { showConfirm: vi.fn().mockResolvedValue(true) };
  state.applyEqBands.mockReset();
  state.applyEqGraph.mockReset();
  state.setVizActive.mockReset();
  state.setUserPresets.mockReset();
  state.setPreamp.mockReset();
  state.cloneBands.mockClear();
  state.matches.mockReset();
  state.matches.mockReturnValue(false);
  state.snapFrequency.mockClear();
  state.eqBandColor.mockClear();
  state.curvePath.mockClear();
  state.ratioToFreq.mockClear();
  state.bandY.mockClear();
  state.dbToY.mockClear();
  state.spectrumPath = ref('spectrum');
  state.sanitizeBands.mockReset();
  state.sanitizePreamp.mockReset();
  state.t.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue('{"bands":[],"preamp":0}')
    }
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('mount and outside clicks', () => {
  it('registers listeners and viz activity', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    setup();
    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(state.setVizActive).toHaveBeenCalledWith(true);

    const removeSpy = vi.spyOn(document, 'removeEventListener');
    wrapper!.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(state.setVizActive).toHaveBeenLastCalledWith(false);
  });

  it('closes menu and panel on outside clicks', () => {
    setup();
    exposed.menuBand.value = 1;
    const outside = document.createElement('span');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(exposed.menuBand.value).toBeNull();
    expect(state.fx.equalizerVisible).toBe(false);
  });

  it('keeps the panel open for clicks inside it or on the toggle', () => {
    setup();
    state.fx.equalizerVisible = true;
    const inside = document.createElement('span');
    panelEl.appendChild(inside);
    inside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.fx.equalizerVisible).toBe(true);

    const toggle = document.createElement('button');
    toggle.closest = vi.fn(() => toggle);
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.fx.equalizerVisible).toBe(true);
  });
});

describe('bands and presets', () => {
  it('exposes band types, limits and colors', () => {
    setup();
    expect(exposed.bandTypes).toEqual(['lowshelf', 'peaking', 'highshelf']);
    expect(exposed.limits.maxBands).toBe(4);
    expect(exposed.presetLabels).toMatchObject({
      flat: 'Flat label',
      rock: 'Rock label',
      classical: 'equalizer.classical',
      bassBoost: 'equalizer.bass',
      trebleBoost: 'equalizer.treble',
      vocal: 'equalizer.vocal'
    });
    expect(exposed.color(1)).toBe('var(--color-primary)');
    state.fx.equalizerMulticolor = true;
    expect(exposed.color(1)).toBe('color-1');
    expect(exposed.snap(123)).toBe(120);
    state.fx.equalizerSnap = false;
    expect(exposed.snap(123)).toBe(123);
    expect(exposed.typeLabel('peaking')).toBe('equalizer.type_peaking');
  });

  it('toggles solo and applies a single-band graph', () => {
    setup();
    exposed.toggleSolo(1);
    expect(exposed.solo.value).toBe(1);
    expect(state.applyEqGraph).toHaveBeenCalledWith([state.fx.equalizerBands[1]]);

    state.fx.equalizerBands = [band(200, 1), band(2000, 2), band(20000, 3)];
    return nextTick().then(() => {
      expect(state.applyEqGraph).toHaveBeenCalledTimes(2);
      exposed.toggleSolo(1);
      expect(exposed.solo.value).toBeNull();
      expect(state.applyEqGraph).toHaveBeenLastCalledWith(state.fx.equalizerBands);
    });
  });

  it('falls back to the full graph for invalid solo indexes', () => {
    setup();
    exposed.solo.value = 99;
    exposed.toggleSolo(99);
    expect(state.applyEqGraph).toHaveBeenLastCalledWith(state.fx.equalizerBands);
  });

  it('detects user presets first, then builtin presets, then custom', async () => {
    setup();
    state.matches.mockImplementation((_bands: unknown, preset: unknown) => {
      return preset === state.fx.equalizerUserPresets.mine;
    });
    expect(exposed.activePreset.value).toBe('mine');

    state.matches.mockImplementation((_bands: unknown, preset: unknown) => {
      return preset === state.presets.rock;
    });
    state.fx.equalizerBands = [...state.fx.equalizerBands];
    await nextTick();
    expect(exposed.activePreset.value).toBe('rock');

    state.matches.mockReturnValue(false);
    state.fx.equalizerBands = [...state.fx.equalizerBands];
    await nextTick();
    expect(exposed.activePreset.value).toBe('custom');
  });

  it('selects user and builtin presets', () => {
    setup();
    exposed.selectPreset('mine');
    expect(state.applyEqBands).toHaveBeenCalledWith(
      state.fx.equalizerUserPresets.mine.map((b: any) => ({ ...b }))
    );
    expect(state.fx.equalizerPreset).toBe('mine');

    exposed.selectPreset('rock');
    expect(state.fx.equalizerPreset).toBe('rock');
    exposed.selectPreset('missing');
    expect(state.applyEqBands).toHaveBeenCalledTimes(2);
  });

  it('commits and patches bands', () => {
    setup();
    const next = [band(100, 5)];
    exposed.commit(next, 'flat');
    expect(state.fx.equalizerPreset).toBe('flat');
    expect(state.applyEqBands).toHaveBeenCalledWith(next);

    exposed.patchBand(1, { gain: 6 });
    expect(state.applyEqBands).toHaveBeenLastCalledWith([
      expect.objectContaining({ gain: -3 }),
      expect.objectContaining({ gain: 6 }),
      expect.objectContaining({ gain: 3 })
    ]);

    state.applyEqBands.mockClear();
    exposed.patchBand(99, { gain: 1 });
    expect(state.applyEqBands).not.toHaveBeenCalled();
  });

  it('switches types and closes the menu', () => {
    setup();
    exposed.menuBand.value = 1;
    exposed.setType(1, 'lowshelf');
    expect(state.applyEqBands).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'lowshelf' }),
      expect.objectContaining({ type: 'lowshelf' }),
      expect.objectContaining({ type: 'highshelf' })
    ]);
    expect(exposed.menuBand.value).toBeNull();
  });

  it('adds and removes bands within limits', async () => {
    setup();
    exposed.addBand();
    expect(state.applyEqBands).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ frequency: 1000, gain: 0 })])
    );
    expect(state.applyEqBands.mock.calls.at(-1)![0]).toHaveLength(4);

    state.fx.equalizerBands = [band(100), band(200), band(300), band(400)];
    await nextTick();
    state.applyEqBands.mockClear();
    exposed.addBand();
    expect(state.applyEqBands).not.toHaveBeenCalled();

    exposed.menuBand.value = 1;
    exposed.removeBand(1);
    expect(state.applyEqBands.mock.calls[0][0]).toHaveLength(3);
    expect(exposed.menuBand.value).toBeNull();
  });

  it('keeps the last band', () => {
    setup();
    state.fx.equalizerBands = [band(100)];
    exposed.removeBand(0);
    expect(state.applyEqBands).not.toHaveBeenCalled();
  });
});

describe('curve interactions', () => {
  it('computes the curve path and zero line', () => {
    setup();
    expect(exposed.curvePath.value).toBe('curve-3-0');
    expect(state.curvePath).toHaveBeenCalledWith(state.fx.equalizerBands, state.curve, 0);
    expect(exposed.zeroLineY).toBe(100);
  });

  it('maps pointer positions to frequency and gain', () => {
    setup();
    exposed.onCurveDblClick(pointerEvent(50, 25));
    expect(state.ratioToFreq).toHaveBeenCalledWith(0.5, 20, 20000);
    expect(state.snapFrequency).toHaveBeenCalled();
    expect(state.applyEqBands).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ frequency: 10010, gain: 6 })])
    );
  });

  it('clamps pointer positions outside the curve', () => {
    setup();
    state.fx.equalizerBands = [];
    exposed.onCurveDblClick(pointerEvent(-50, 500));
    expect(state.ratioToFreq).toHaveBeenCalledWith(0, 20, 20000);
    expect(state.applyEqBands).toHaveBeenCalledWith([
      expect.objectContaining({ gain: -12, frequency: 20 })
    ]);
  });

  it('skips curve actions without an element or when full', () => {
    setup(null);
    exposed.onCurveDblClick(pointerEvent(10, 10));
    expect(state.applyEqBands).not.toHaveBeenCalled();

    wrapper!.unmount();
    wrapper = null;
    state.fx.equalizerBands = [band(1), band(2), band(3), band(4)];
    setup();
    exposed.onCurveDblClick(pointerEvent(10, 10));
    expect(state.applyEqBands).not.toHaveBeenCalled();
  });

  it('drags a band with pointer capture', () => {
    setup();
    const capture = vi.fn();
    const down = pointerEvent(10, 10, { pointerId: 3 });
    Object.defineProperty(down, 'currentTarget', {
      value: { setPointerCapture: capture },
      configurable: true
    });
    exposed.onCurveDown(1, down as PointerEvent);
    expect(down.defaultPrevented).toBe(true);
    expect(exposed.draggingBand.value).toBe(1);
    expect(capture).toHaveBeenCalledWith(3);

    exposed.onCurveMove(pointerEvent(100, 50) as unknown as PointerEvent);
    expect(state.applyEqBands).toHaveBeenCalled();
    exposed.onCurveUp();
    expect(exposed.draggingBand.value).toBeNull();

    state.applyEqBands.mockClear();
    exposed.onCurveMove(pointerEvent(100, 50) as unknown as PointerEvent);
    expect(state.applyEqBands).not.toHaveBeenCalled();
  });

  it('resets marker gain on double click', () => {
    setup();
    exposed.onMarkerDblClick(1);
    expect(state.applyEqBands).toHaveBeenCalledWith([
      expect.objectContaining({ gain: -3 }),
      expect.objectContaining({ gain: 0 }),
      expect.objectContaining({ gain: 3 })
    ]);
  });

  it('toggles the band menu with right click', () => {
    setup();
    const event = new MouseEvent('contextmenu', { cancelable: true });
    exposed.onMarkerContext(event, 2);
    expect(event.defaultPrevented).toBe(true);
    expect(exposed.menuBand.value).toBe(2);
    exposed.onMarkerContext(event, 2);
    expect(exposed.menuBand.value).toBeNull();
  });

  it('positions the menu below or above depending on the band', () => {
    setup();
    expect(exposed.menuBelow.value).toBe(true);

    state.bandY.mockReturnValueOnce(10);
    exposed.menuBand.value = 1;
    expect(exposed.menuBelow.value).toBe(true);

    state.bandY.mockReturnValueOnce(90);
    exposed.menuBand.value = 2;
    expect(exposed.menuBelow.value).toBe(false);
  });
});

describe('preset management', () => {
  it('suggests a default name and validates it', () => {
    setup();
    exposed.savePreset();
    expect(exposed.naming.value).toBe(true);
    expect(exposed.presetName.value).toBe('equalizer.custom 2');

    expect(exposed.canSavePreset.value).toBe(true);
    exposed.presetName.value = '';
    expect(exposed.canSavePreset.value).toBe(false);
    exposed.presetName.value = 'flat';
    expect(exposed.canSavePreset.value).toBe(false);
    exposed.presetName.value = 'mine';
    expect(exposed.canSavePreset.value).toBe(false);
  });

  it('saves a new preset and closes naming', () => {
    setup();
    exposed.presetName.value = ' New preset ';
    exposed.confirmSavePreset();
    expect(state.setUserPresets).toHaveBeenCalledWith({
      mine: state.fx.equalizerUserPresets.mine.map((b: any) => ({ ...b })),
      'New preset': state.fx.equalizerBands.map((b: any) => ({ ...b }))
    });
    expect(exposed.naming.value).toBe(false);
    expect(exposed.presetName.value).toBe('');
  });

  it('rejects empty and duplicate names', () => {
    setup();
    exposed.presetName.value = '';
    exposed.confirmSavePreset();
    expect(state.setUserPresets).not.toHaveBeenCalled();

    exposed.presetName.value = 'mine';
    exposed.confirmSavePreset();
    expect(state.ui.notify).toHaveBeenCalledWith(
      'error',
      'equalizer.savePreset',
      'equalizer.presetExists'
    );
  });

  it('deletes presets after confirmation', async () => {
    setup();
    await exposed.deletePreset('mine');
    expect(state.prompt.showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('equalizer.presetDeleteConfirm')
    );
    expect(state.setUserPresets).toHaveBeenCalledWith({});

    state.prompt.showConfirm.mockResolvedValue(false);
    state.setUserPresets.mockClear();
    await exposed.deletePreset('other');
    expect(state.setUserPresets).not.toHaveBeenCalled();
  });
});

describe('export and import', () => {
  it('exports bands and preamp to the clipboard', async () => {
    setup();
    await exposed.exportEq();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ bands: state.fx.equalizerBands, preamp: 0 })
    );
  });

  it('notifies on export failures', async () => {
    setup();
    (navigator.clipboard.writeText as any).mockRejectedValueOnce(new Error('denied'));
    await exposed.exportEq();
    expect(state.ui.notify).toHaveBeenCalledWith(
      'error',
      'equalizer.export',
      'equalizer.exportError'
    );
  });

  it('imports bands and preamp', async () => {
    setup();
    const imported = [band(100, 3)];
    state.sanitizeBands.mockReturnValueOnce(imported);
    state.sanitizePreamp.mockReturnValueOnce(4);
    (navigator.clipboard.readText as any).mockResolvedValueOnce(
      JSON.stringify({ bands: imported, preamp: 4 })
    );

    await exposed.importEq();
    expect(state.applyEqBands).toHaveBeenCalledWith(imported);
    expect(state.setPreamp).toHaveBeenCalledWith(4);
  });

  it('skips preamp when absent', async () => {
    setup();
    state.sanitizeBands.mockReturnValueOnce([band(100)]);
    state.sanitizePreamp.mockReturnValueOnce(undefined);
    (navigator.clipboard.readText as any).mockResolvedValueOnce('{"bands":[]}');
    await exposed.importEq();
    expect(state.setPreamp).not.toHaveBeenCalled();
  });

  it('rejects invalid imports', async () => {
    setup();
    state.sanitizeBands.mockReturnValueOnce([]);
    await exposed.importEq();
    expect(state.ui.notify).toHaveBeenCalledWith(
      'error',
      'equalizer.import',
      'equalizer.importError'
    );

    (navigator.clipboard.readText as any).mockRejectedValueOnce(new Error('denied'));
    await exposed.importEq();
    expect(state.ui.notify).toHaveBeenCalledTimes(2);
  });
});
