import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import SettingsTheme from '../SettingsTheme.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  appearanceRef: null as any,
  engine: null as any,
  resolved: null as any,
  resolveAppearance: vi.fn(),
  applyPreviewVars: vi.fn(),
  reapplyTheme: vi.fn(),
  sanitizeHex: vi.fn(),
  tokenToCssVar: vi.fn((id: string) => `--c-${id}`),
  clipboardWrite: vi.fn(),
  clipboardRead: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('pinia', () => ({ storeToRefs: () => ({ appearance: state.appearanceRef }) }));
vi.mock('@renderer/composables/useTheme', () => ({
  getThemeEngine: () => state.engine
}));
vi.mock('@shared/builtin-themes', () => ({
  resolveThemeAppearance: state.resolveAppearance,
  BUILTIN_THEME_NAMES: ['dark', 'light']
}));
vi.mock('@shared/themeModel', () => ({
  COLOR_TOKEN_IDS: ['base100', 'base300', 'primary', 'secondary', 'error', 'success'],
  tokenToCssVar: state.tokenToCssVar,
  sanitizeHex: state.sanitizeHex
}));
vi.mock('@renderer/utils/themeTokens', () => ({
  BASE_TOKENS: ['base100', 'base300'],
  BRAND_TOKENS: ['primary', 'secondary'],
  STATUS_TOKENS: ['error', 'success'],
  PREVIEW_TOKENS: ['base100', 'primary']
}));

const PickerStub = { template: '<div data-testid="theme-picker" />' };
const GeometryStub = { template: '<div data-testid="theme-geometry" />' };
const ButtonStub = defineComponent({
  props: ['variant', 'size'],
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>'
});
const ColorStub = defineComponent({
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<input data-testid="color-input" :value="modelValue" />'
});
const SliderStub = defineComponent({
  props: ['modelValue', 'label', 'min', 'max', 'valueText'],
  emits: ['update:modelValue'],
  template: '<input type="range" data-testid="slider" :value="modelValue" />'
});

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(SettingsTheme, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsThemePicker: PickerStub,
        SettingsThemeGeometry: GeometryStub,
        Button: ButtonStub,
        ColorInput: ColorStub,
        Slider: SliderStub
      }
    }
  });
  return wrapper;
}

function colors(overrides: Record<string, string> = {}) {
  return {
    base100: '#101010',
    base300: '#303030',
    primary: '#7c6aef',
    secondary: '#22ccaa',
    error: '#ff0000',
    success: '#00ff00',
    ...overrides
  };
}

function appearance(overrides: Record<string, unknown> = {}) {
  return {
    theme: 'builtin',
    customBase: 'dark',
    customColors: {} as Record<string, string>,
    glassAlpha: 80,
    glassBlur: 20,
    ...overrides
  };
}

function buttonsByText(text: string) {
  return wrapper!.findAll('button').filter((b) => b.text() === text);
}

beforeEach(() => {
  state.settings = reactive({
    appearance: appearance(),
    updateAppearance: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(state.settings.appearance, patch)
    )
  });
  state.appearanceRef = ref(state.settings.appearance);
  state.engine = {
    applyPreviewVars: state.applyPreviewVars,
    reapplyTheme: state.reapplyTheme
  };
  state.applyPreviewVars.mockReset();
  state.reapplyTheme.mockReset();
  state.resolveAppearance.mockReset();
  state.resolved = colors();
  state.resolveAppearance.mockImplementation(() => ({ colors: state.resolved }));
  state.sanitizeHex.mockReset();
  state.sanitizeHex.mockImplementation((value: unknown) =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
  );
  state.tokenToCssVar.mockClear();
  state.clipboardWrite.mockReset();
  state.clipboardWrite.mockResolvedValue(undefined);
  state.clipboardRead.mockReset();
  state.clipboardRead.mockResolvedValue('{"base":"light","colors":{"primary":"#AABBCC"}}');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: state.clipboardWrite, readText: state.clipboardRead }
  });
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('builtin and preview', () => {
  it('shows the builtin hint and preview swatches', () => {
    mountView();
    expect(wrapper!.text()).toContain('creator.builtinHint');
    expect(wrapper!.find('[data-testid="theme-picker"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="theme-geometry"]').exists()).toBe(true);
    expect(
      wrapper!
        .findAll('[title]')
        .some((el) => el.attributes('title') === 'creator.tokens.base100 #101010')
    ).toBe(true);
    expect(wrapper!.text()).toContain('#7c6aef');
    expect(state.resolveAppearance).toHaveBeenCalledWith(state.settings.appearance);
  });
});

describe('custom theme', () => {
  beforeEach(() => {
    state.settings.appearance = appearance({ theme: 'custom' });
  });

  it('renders scheme seeds and marks the active base', async () => {
    mountView();
    const dark = wrapper!.get('[data-testid="theme-seed-dark"]');
    const light = wrapper!.get('[data-testid="theme-seed-light"]');
    expect(dark.classes()).toContain('border-primary');
    expect(light.classes()).not.toContain('border-primary');

    await light.trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ customBase: 'light' });
  });

  it('defaults the active seed to dark', () => {
    state.settings.appearance.customBase = undefined;
    mountView();
    expect(wrapper!.get('[data-testid="theme-seed-dark"]').classes()).toContain('border-primary');
  });

  it('renders token sections with labels and values', () => {
    mountView();
    expect(wrapper!.text()).toContain('creator.baza');
    expect(wrapper!.text()).toContain('creator.brand');
    expect(wrapper!.text()).toContain('creator.statuses');
    const labels = wrapper!.findAll('span[title]').map((s) => s.attributes('title'));
    expect(labels).toEqual(
      expect.arrayContaining(['creator.tokens.base100', 'creator.tokens.primary'])
    );
    expect(wrapper!.findAllComponents(ColorStub)).toHaveLength(6);
  });

  it('prefers custom colors over resolved values', () => {
    state.settings.appearance.customColors = { primary: '#abcdef' };
    mountView();
    const inputs = wrapper!.findAllComponents(ColorStub);
    expect(inputs.map((i) => i.props('modelValue'))).toEqual([
      '#101010',
      '#303030',
      '#abcdef',
      '#22ccaa',
      '#ff0000',
      '#00ff00'
    ]);
  });

  it('updates a sanitized color and applies a preview variable', async () => {
    mountView();
    const primary = wrapper!.findAllComponents(ColorStub)[2];
    primary.vm.$emit('update:modelValue', '#AABBCC');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      customColors: { primary: '#aabbcc' }
    });
    expect(state.tokenToCssVar).toHaveBeenCalledWith('primary');
    expect(state.applyPreviewVars).toHaveBeenCalledWith({ '--c-primary': '#aabbcc' });
  });

  it('ignores invalid colors', () => {
    mountView();
    const primary = wrapper!.findAllComponents(ColorStub)[2];
    primary.vm.$emit('update:modelValue', 'not-a-color');
    expect(state.settings.updateAppearance).not.toHaveBeenCalled();
    expect(state.applyPreviewVars).not.toHaveBeenCalled();
  });

  it('merges colors into existing custom overrides', () => {
    state.settings.appearance.customColors = { base100: '#000000' };
    mountView();
    wrapper!.findAllComponents(ColorStub)[2].vm.$emit('update:modelValue', '#123456');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      customColors: { base100: '#000000', primary: '#123456' }
    });
  });

  it('resets to dark or light seeds', async () => {
    mountView();
    await buttonsByText('creator.seedDark')[0].trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      customBase: 'dark',
      customColors: {}
    });
    expect(state.reapplyTheme).toHaveBeenCalled();

    await buttonsByText('creator.seedLight')[0].trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenLastCalledWith({
      customBase: 'light',
      customColors: {}
    });
  });

  it('copies the theme JSON', async () => {
    state.settings.appearance.customColors = { primary: '#123456' };
    mountView();
    await buttonsByText('creator.copy')[0].trigger('click');
    await Promise.resolve();
    expect(state.clipboardWrite).toHaveBeenCalledWith(
      JSON.stringify({ base: 'dark', colors: { primary: '#123456' } }, null, 2)
    );
  });

  it('swallows clipboard write failures', async () => {
    state.clipboardWrite.mockRejectedValueOnce(new Error('denied'));
    mountView();
    await expect(buttonsByText('creator.copy')[0].trigger('click')).resolves.toBeUndefined();
    await Promise.resolve();
  });

  it('pastes sanitized theme colors', async () => {
    mountView();
    await buttonsByText('creator.paste')[0].trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(state.clipboardRead).toHaveBeenCalled();
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      theme: 'custom',
      customBase: 'light',
      customColors: { primary: '#aabbcc' }
    });
  });

  it('rejects invalid pasted JSON and invalid colors', async () => {
    state.clipboardRead.mockResolvedValueOnce('not json');
    mountView();
    await buttonsByText('creator.paste')[0].trigger('click');
    await Promise.resolve();
    expect(state.settings.updateAppearance).not.toHaveBeenCalled();

    state.clipboardRead.mockResolvedValueOnce('{"colors":{"primary":"bad","error":"#FF0000"}}');
    await buttonsByText('creator.paste')[0].trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(state.settings.updateAppearance).toHaveBeenLastCalledWith({
      theme: 'custom',
      customBase: 'dark',
      customColors: { error: '#ff0000' }
    });
  });

  it('defaults pasted base to dark', async () => {
    state.clipboardRead.mockResolvedValueOnce('{"colors":{}}');
    mountView();
    await buttonsByText('creator.paste')[0].trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(state.settings.updateAppearance).toHaveBeenLastCalledWith({
      theme: 'custom',
      customBase: 'dark',
      customColors: {}
    });
  });
});

describe('glass sliders', () => {
  it('renders and updates glass opacity and blur', async () => {
    mountView();
    const sliders = wrapper!.findAllComponents(SliderStub);
    expect(sliders[0].props()).toMatchObject({
      modelValue: 80,
      min: 0,
      max: 100,
      valueText: '80%'
    });
    expect(sliders[1].props()).toMatchObject({
      modelValue: 20,
      min: 0,
      max: 32,
      valueText: '20 px'
    });

    sliders[0].vm.$emit('update:modelValue', 55);
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ glassAlpha: 55 });
    sliders[1].vm.$emit('update:modelValue', 8);
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ glassBlur: 8 });
  });

  it('uses defaults when values are missing', () => {
    state.settings.appearance.glassAlpha = undefined;
    state.settings.appearance.glassBlur = undefined;
    mountView();
    const sliders = wrapper!.findAllComponents(SliderStub);
    expect(sliders[0].props('modelValue')).toBe(100);
    expect(sliders[1].props('modelValue')).toBe(14);
    expect(sliders[1].props('valueText')).toBe('14 px');
  });
});
