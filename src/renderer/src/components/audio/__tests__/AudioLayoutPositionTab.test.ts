import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@renderer/utils/audioLayoutEditorMeta', () => ({
  ELEMENT_META: {
    cover: { labelKey: 'el.cover' },
    visualization: { labelKey: 'el.visualization' }
  }
}));
vi.mock('@renderer/utils/audioLayout', () => ({
  CONSTRAINTS: {
    cover: { aspect: 16 / 9, minW: 10, minH: 5 },
    visualization: { minW: 2, minH: 3 }
  }
}));

import AudioLayoutPositionTab from '../AudioLayoutPositionTab.vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

let wrapper: VueWrapper | null = null;

function element(overrides: Partial<AudioLayoutElement> = {}): AudioLayoutElement {
  return {
    id: 'visualization',
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    layer: 2,
    opacity: 80,
    bg: false,
    ...overrides
  } as AudioLayoutElement;
}

function mountTab(el?: AudioLayoutElement) {
  wrapper = mount(AudioLayoutPositionTab, { props: el ? { element: el } : {} });
  return wrapper;
}

function ranges() {
  return wrapper!.findAll('input[type="range"]');
}

function inputRange(index: number, value: number) {
  const input = ranges()[index];
  (input.element as HTMLInputElement).value = String(value);
  return input.trigger('input');
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('empty state', () => {
  it('renders nothing without an element', () => {
    mountTab();

    expect(wrapper!.find('input').exists()).toBe(false);
  });
});

describe('position and size', () => {
  it('shows the label and formatted percentages', () => {
    mountTab(element());

    expect(wrapper!.text()).toContain('el.visualization');
    expect(wrapper!.text()).toContain('X');
    expect(wrapper!.text()).toContain('10%');
    expect(wrapper!.text()).toContain('20%');
    expect(wrapper!.text()).toContain('30%');
    expect(wrapper!.text()).toContain('40%');
    expect(wrapper!.text()).toContain('80%');
    expect(wrapper!.text()).toContain('2');
  });

  it('limits ranges to keep the element inside the canvas', () => {
    mountTab(element({ x: 10, y: 20, width: 30, height: 40 }));

    const [x, y, width, height] = ranges();
    expect(x.attributes('max')).toBe('70');
    expect(y.attributes('max')).toBe('60');
    expect(width.attributes('min')).toBe('2');
    expect(width.attributes('max')).toBe('90');
    expect(height.attributes('min')).toBe('3');
    expect(height.attributes('max')).toBe('80');
  });

  it('emits numeric position and size patches', async () => {
    mountTab(element());

    await inputRange(0, 15);
    await inputRange(1, 25);
    await inputRange(2, 35);
    await inputRange(3, 45);
    await inputRange(4, 55);
    await inputRange(5, 3);

    expect(wrapper!.emitted('update')).toEqual([
      [{ x: 15 }],
      [{ y: 25 }],
      [{ width: 35 }],
      [{ height: 45 }],
      [{ opacity: 55 }],
      [{ layer: 3 }]
    ]);
  });

  it('uses 100% opacity when none is stored', () => {
    mountTab(element({ opacity: undefined }));

    expect((ranges()[4].element as HTMLInputElement).value).toBe('100');
  });
});

describe('locked aspect', () => {
  it('hides the height slider and explains the lock', () => {
    mountTab(element({ id: 'cover' as never }));

    expect(wrapper!.text()).toContain('16:9');
    expect(wrapper!.text()).toContain('audioView.coverAspectLocked');
    expect(ranges()).toHaveLength(5);
  });

  it('shows the height slider when the aspect is free', () => {
    mountTab(element());

    expect(wrapper!.text()).not.toContain('audioView.coverAspectLocked');
    expect(ranges()).toHaveLength(6);
  });
});

describe('background', () => {
  it('toggles the background and reveals its opacity', async () => {
    mountTab(element({ bg: true, bgOpacity: 30 }));

    expect(wrapper!.text()).toContain('audioView.elementBgOpacity');
    expect(wrapper!.text()).toContain('30%');
    expect(ranges()).toHaveLength(7);

    const toggle = wrapper!.findAll('button')[0];
    await toggle.trigger('click');
    expect(wrapper!.emitted('update')).toEqual([[{ bg: false }]]);

    await inputRange(6, 65);
    expect(wrapper!.emitted('update')).toContainEqual([{ bgOpacity: 65 }]);
  });

  it('turns the background on from the toggle', async () => {
    mountTab(element({ bg: false }));

    expect(wrapper!.text()).not.toContain('audioView.elementBgOpacity');
    await wrapper!.findAll('button')[0].trigger('click');

    expect(wrapper!.emitted('update')).toEqual([[{ bg: true }]]);
  });

  it('defaults the background opacity to 40%', () => {
    mountTab(element({ bg: true, bgOpacity: undefined }));

    expect(wrapper!.text()).toContain('40%');
  });
});
