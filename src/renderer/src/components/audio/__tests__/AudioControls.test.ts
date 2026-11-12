import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  trigger(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
}

const CoreStub = {
  name: 'AudioControlsCore',
  props: ['variant', 'compact', 'widthSufficient', 'volumeFit'],
  template: '<div data-testid="core" />'
};
const MicroStub = { name: 'AudioControlsMicro', template: '<div data-testid="micro" />' };

import AudioControls from '../AudioControls.vue';

let wrapper: VueWrapper | null = null;

function mountControls(variant?: string) {
  wrapper = mount(AudioControls, {
    props: variant ? { variant } : {},
    global: { stubs: { AudioControlsCore: CoreStub, AudioControlsMicro: MicroStub } }
  });
  return wrapper;
}

function observer() {
  return MockResizeObserver.instances[0];
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('responsive layout', () => {
  it('observes the root element on mount', () => {
    mountControls();

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(observer().observe).toHaveBeenCalledWith(wrapper!.element);
  });

  it('starts wide and passes fitting flags to the core controls', () => {
    mountControls();

    const core = wrapper!.findComponent(CoreStub);
    expect(core.exists()).toBe(true);
    expect(core.props('variant')).toBe('wide');
    expect(core.props('widthSufficient')).toBe(false);
    expect(core.props('volumeFit')).toBe(false);
  });

  it('switches to micro controls for short boxes', async () => {
    mountControls();

    observer().trigger(400, 20);
    await nextTick();

    expect(wrapper!.findComponent(MicroStub).exists()).toBe(true);
    expect(wrapper!.findComponent(CoreStub).exists()).toBe(false);
  });

  const layoutCases: Array<[number, number, string, boolean, boolean]> = [
    [400, 200, 'wide', true, true],
    [200, 100, 'compact', true, true],
    [170, 150, 'tall', true, true],
    [170, 50, 'minimal', true, true],
    [100, 50, 'minimal', false, true]
  ];

  it.each(layoutCases)(
    'maps %ix%i to %s',
    async (width, height, expected, widthSufficient, volumeFit) => {
      mountControls();

      observer().trigger(width, height);
      await nextTick();

      const core = wrapper!.findComponent(CoreStub);
      expect(core.props('variant')).toBe(expected);
      expect(core.props('widthSufficient')).toBe(widthSufficient);
      expect(core.props('volumeFit')).toBe(volumeFit);
    }
  );

  it('passes the compact variant flag through', () => {
    mountControls('compact');

    expect(wrapper!.findComponent(CoreStub).props('compact')).toBe(true);
  });

  it('disconnects the observer on unmount', () => {
    mountControls();
    const ro = observer();

    wrapper!.unmount();
    wrapper = null;

    expect(ro.disconnect).toHaveBeenCalledTimes(1);
  });
});
