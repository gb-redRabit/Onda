import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const SwitchControl = defineComponent({
  name: 'SwitchControl',
  props: { modelValue: Boolean, size: String, label: String },
  emits: ['update:modelValue'],
  template:
    '<button type="button" v-bind="$attrs" :data-model="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)" />'
});

import ImageViewerSettings from '../ImageViewerSettings.vue';

let wrapper: VueWrapper | null = null;
const defaults = {
  interval: 3000,
  transitionType: 'fade',
  transitionDuration: 500,
  loop: false,
  shuffle: true,
  kenBurns: false,
  autoHide: true
};

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(ImageViewerSettings, {
    props: { ...defaults, ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Switch: SwitchControl }
    }
  });
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders all options and highlights the active ones', () => {
    setup();

    const panel = wrapper!.get('[data-testid="image-viewer-settings"]');
    expect(panel.text()).toContain('imageViewer.ssSlideshow');
    expect(panel.text()).toContain('imageViewer.ssToggleUi');
    expect(wrapper!.findAll('button[data-testid^="iv-interval-"]')).toHaveLength(5);
    expect(wrapper!.findAll('button[data-testid^="iv-transition-"]')).toHaveLength(8);
    expect(wrapper!.findAll('button[data-testid^="iv-duration-"]')).toHaveLength(6);

    expect(wrapper!.get('[data-testid="iv-interval-3000"]').classes()).toContain('bg-primary');
    expect(wrapper!.get('[data-testid="iv-transition-fade"]').classes()).toContain('bg-primary');
    expect(wrapper!.get('[data-testid="iv-duration-500"]').classes()).toContain('bg-primary');
    expect(wrapper!.get('[data-testid="iv-interval-1000"]').classes()).not.toContain('bg-primary');

    expect(wrapper!.get('[data-testid="iv-loop"]').attributes('data-model')).toBe('false');
    expect(wrapper!.get('[data-testid="iv-shuffle"]').attributes('data-model')).toBe('true');
    expect(wrapper!.get('[data-testid="iv-ken-burns"]').attributes('data-model')).toBe('false');
    expect(wrapper!.get('[data-testid="iv-auto-hide"]').attributes('data-model')).toBe('true');
  });

  it('stops click propagation', async () => {
    setup();
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await wrapper!.get('[data-testid="image-viewer-settings"]').trigger('click');

    expect(stop).toHaveBeenCalled();
  });
});

describe('emitting updates', () => {
  it('emits interval, transition and duration changes', async () => {
    setup();

    await wrapper!.get('[data-testid="iv-interval-10000"]').trigger('click');
    await wrapper!.get('[data-testid="iv-transition-swirl"]').trigger('click');
    await wrapper!.get('[data-testid="iv-duration-800"]').trigger('click');

    expect(wrapper!.emitted('update:interval')).toEqual([[10000]]);
    expect(wrapper!.emitted('update:transitionType')).toEqual([['swirl']]);
    expect(wrapper!.emitted('update:transitionDuration')).toEqual([[800]]);
  });

  it('emits toggle changes from switches', async () => {
    setup();

    await wrapper!.get('[data-testid="iv-loop"]').trigger('click');
    await wrapper!.get('[data-testid="iv-shuffle"]').trigger('click');
    await wrapper!.get('[data-testid="iv-ken-burns"]').trigger('click');
    await wrapper!.get('[data-testid="iv-auto-hide"]').trigger('click');

    expect(wrapper!.emitted('update:loop')).toEqual([[true]]);
    expect(wrapper!.emitted('update:shuffle')).toEqual([[false]]);
    expect(wrapper!.emitted('update:kenBurns')).toEqual([[true]]);
    expect(wrapper!.emitted('update:autoHide')).toEqual([[false]]);
  });
});
