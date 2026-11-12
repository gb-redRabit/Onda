import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  decorations: [
    { value: 'none', label: 'None' },
    { value: 'glow', label: 'Glow', plugin: 'Demo' }
  ] as Array<{ value: string; label: string; plugin?: string }>,
  decorationOptionsFor: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/plugins', () => ({
  usePluginsStore: () => ({ layoutVariants: {} })
}));
vi.mock('@renderer/utils/audioLayoutDecorations', () => ({
  decorationOptionsFor: h.decorationOptionsFor
}));
vi.mock('@renderer/utils/audioLayoutEditorMeta', () => ({
  PRESET_KEYS: ['compact', 'full'],
  PRESET_ICONS: { compact: { template: '<i />' }, full: { template: '<i />' } },
  TABS: ['elements', 'variant', 'layout'],
  SUBTAB_KEYS: { elements: 'elementsTab', variant: 'variantTab', layout: 'layoutTab' },
  VARIANT_DEFAULT: { cover: 'a', visualization: 'a' },
  VARIANT_KEYS: {
    cover: [
      { value: 'a', key: 'variantA' },
      { value: 'b', key: 'variantB' }
    ],
    visualization: [
      { value: 'a', key: 'variantA' },
      { value: 'b', key: 'variantB' }
    ]
  },
  ELEMENT_META: {
    cover: { labelKey: 'el.cover', icon: { template: '<i />' } },
    visualization: { labelKey: 'el.visualization', icon: { template: '<i />' } }
  }
}));

import AudioLayoutRightPanel from '../AudioLayoutRightPanel.vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

const PositionStub = defineComponent({
  name: 'AudioLayoutPositionTab',
  props: ['element'],
  emits: ['update'],
  template: '<div data-testid="position-tab" />'
});

let wrapper: VueWrapper | null = null;

function element(
  id: 'cover' | 'visualization',
  overrides: Partial<AudioLayoutElement> = {}
): AudioLayoutElement {
  return {
    id,
    layer: 1,
    visible: true,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...overrides
  } as AudioLayoutElement;
}

const elements = () => [element('cover'), element('visualization', { layer: 2 })];

function mountPanel(overrides: Record<string, unknown> = {}) {
  wrapper = mount(AudioLayoutRightPanel, {
    props: {
      elements: elements(),
      selected: element('cover'),
      selectedId: 'cover',
      currentPreset: 'compact',
      ...overrides
    },
    global: { stubs: { AudioLayoutPositionTab: PositionStub } }
  });
  return wrapper;
}

function tab(label: string) {
  return wrapper!.findAll('button').find((item) => item.text() === label)!;
}

beforeEach(() => {
  h.t.mockClear();
  h.decorationOptionsFor.mockReset().mockReturnValue(h.decorations);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('presets', () => {
  it('renders presets and marks the current one', async () => {
    mountPanel();
    const compact = tab('audioView.presetCompact');
    const full = tab('audioView.presetFull');

    expect(compact.attributes('aria-pressed')).toBe('true');
    expect(full.attributes('aria-pressed')).toBe('false');

    await full.trigger('click');

    expect(wrapper!.emitted('applyPreset')).toEqual([['full']]);
  });
});

describe('tabs', () => {
  it('switches between the element, variant and layout tabs', async () => {
    mountPanel();

    expect(wrapper!.find('[data-testid="position-tab"]').exists()).toBe(false);

    await tab('audioView.variantTab').trigger('click');
    expect(h.t).toHaveBeenCalledWith('el.cover');

    await tab('audioView.layoutTab').trigger('click');
    expect(wrapper!.findComponent(PositionStub).exists()).toBe(true);

    await tab('audioView.elementsTab').trigger('click');
    expect(wrapper!.find('[data-testid="position-tab"]').exists()).toBe(false);
  });
});

describe('element list', () => {
  it('selects elements and toggles visibility', async () => {
    mountPanel({ selectedId: 'visualization' });

    const rows = wrapper!.findAll('.cursor-pointer');
    expect(rows[0].classes()).toContain('text-base-content/70');
    expect(rows[1].classes()).toContain('bg-primary/10');

    await rows[0].trigger('click');
    expect(wrapper!.emitted('select')).toEqual([['cover']]);

    const hide = rows[0].findAll('button')[0];
    expect(hide.attributes('aria-pressed')).toBe('false');
    await hide.trigger('click');
    expect(wrapper!.emitted('update')).toEqual([['cover', { visible: false }]]);
  });

  it('marks hidden elements and offers showing them', async () => {
    mountPanel({ elements: [element('cover', { visible: false })] });

    const row = wrapper!.find('.cursor-pointer');
    expect(row.classes()).toContain('opacity-50');
    expect(row.findAll('button')[0].attributes('aria-pressed')).toBe('true');

    await row.findAll('button')[0].trigger('click');
    expect(wrapper!.emitted('update')).toEqual([['cover', { visible: true }]]);
  });

  it('shows the layer label', () => {
    mountPanel();

    expect(wrapper!.text()).toContain('L1');
    expect(wrapper!.text()).toContain('L2');
  });
});

describe('variant tab', () => {
  it('shows variants and applies the chosen one', async () => {
    mountPanel();
    await tab('audioView.variantTab').trigger('click');

    const variants = wrapper!.findAll('.flex-wrap')[0].findAll('button');
    expect(variants.map((item) => item.text())).toEqual([
      'audioView.variantA',
      'audioView.variantB'
    ]);
    expect(variants[0].attributes('aria-pressed')).toBe('true');

    await variants[1].trigger('click');

    expect(wrapper!.emitted('update')).toEqual([['cover', { variant: 'b' }]]);
  });

  it('shows the visualization hint and honours an explicit variant', async () => {
    mountPanel({
      selected: element('visualization', { variant: 'b' }),
      selectedId: 'visualization'
    });
    await tab('audioView.variantTab').trigger('click');

    expect(wrapper!.text()).toContain('audioView.variantVizHint');
    const variants = wrapper!.findAll('.flex-wrap')[0].findAll('button');
    expect(variants[1].attributes('aria-pressed')).toBe('true');
  });

  it('renders decoration options with plugin labels and updates them', async () => {
    mountPanel();
    await tab('audioView.variantTab').trigger('click');

    expect(h.decorationOptionsFor).toHaveBeenCalledWith('cover', {}, h.t);
    expect(wrapper!.text()).toContain('audioView.decorationLabel');
    expect(wrapper!.text()).toContain('Glow');

    const decorationButtons = wrapper!.findAll('.mt-3 button');
    expect(decorationButtons[0].attributes('aria-pressed')).toBe('true');

    await decorationButtons[1].trigger('click');
    expect(wrapper!.emitted('update')).toEqual([['cover', { decoration: 'glow' }]]);
  });

  it('hides decorations when there are no options', async () => {
    h.decorationOptionsFor.mockReturnValue([]);
    mountPanel();
    await tab('audioView.variantTab').trigger('click');

    expect(wrapper!.text()).not.toContain('audioView.decorationLabel');
  });

  it('renders nothing without a selected element', async () => {
    mountPanel({ selected: undefined });
    await tab('audioView.variantTab').trigger('click');

    expect(wrapper!.text()).not.toContain('el.cover');
    expect(h.decorationOptionsFor).not.toHaveBeenCalled();
  });
});

describe('layout tab', () => {
  it('forwards position updates for the selected element', async () => {
    mountPanel();
    await tab('audioView.layoutTab').trigger('click');

    wrapper!.findComponent(PositionStub).vm.$emit('update', { x: 10 });

    expect(wrapper!.emitted('update')).toEqual([['cover', { x: 10 }]]);
  });

  it('ignores position updates without a selected element', async () => {
    mountPanel({ selected: undefined });
    await tab('audioView.layoutTab').trigger('click');

    wrapper!.findComponent(PositionStub).vm.$emit('update', { x: 10 });

    expect(wrapper!.emitted('update')).toBeUndefined();
  });
});
