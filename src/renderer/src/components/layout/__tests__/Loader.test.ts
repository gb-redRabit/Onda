import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import Loader from '../Loader.vue';

const state = vi.hoisted(() => ({
  ctx: null as any,
  raf: vi.fn(),
  frame: null as any,
  cancel: vi.fn(),
  reducedMotion: false,
  primary: '#7c6aef'
}));

let wrapper: VueWrapper | null = null;

function makeContext() {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: ''
  };
}

function mountLoader(props: Record<string, unknown> = {}) {
  wrapper = mount(Loader, { props });
  return wrapper;
}

beforeEach(() => {
  state.ctx = makeContext();
  state.raf = vi.fn();
  state.frame = null;
  state.cancel = vi.fn();
  state.reducedMotion = false;
  state.primary = '#7c6aef';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => state.ctx as unknown as CanvasRenderingContext2D
  );
  vi.stubGlobal('requestAnimationFrame', state.raf);
  vi.stubGlobal('cancelAnimationFrame', state.cancel);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: state.reducedMotion,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        }) as never
    )
  );
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => (name === '--color-primary' ? state.primary : '')
  } as never);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('presentation', () => {
  it('renders a status with default sizing and no label', () => {
    mountLoader();
    const root = wrapper!.get('[role="status"]');
    expect(root.attributes('aria-label')).toBeUndefined();
    expect(root.classes()).toContain('py-8');
    expect(wrapper!.find('canvas').attributes('style')).toContain('width: 96px');
  });

  it('renders the label and overlay layout', () => {
    mountLoader({ size: 48, label: 'Loading…', overlay: true });
    expect(wrapper!.get('[role="status"]').attributes('aria-label')).toBe('Loading…');
    expect(wrapper!.get('[role="status"]').classes()).toContain('h-full');
    expect(wrapper!.text()).toContain('Loading…');
    expect(wrapper!.find('canvas').attributes('style')).toContain('width: 48px');
  });
});

describe('canvas setup', () => {
  it('scales the canvas by device pixel ratio and draws', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    state.raf.mockImplementation((callback: FrameRequestCallback) => {
      state.frame = callback;
      return 1;
    });
    mountLoader();
    state.frame(16);
    const canvas = wrapper!.find('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(192);
    expect(canvas.height).toBe(192);
    expect(state.ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(state.ctx.clearRect).toHaveBeenCalled();
    expect(state.ctx.stroke).toHaveBeenCalled();
    expect(state.raf).toHaveBeenCalled();
  });

  it('falls back to the brand colour for invalid CSS values', () => {
    state.primary = 'rgb(1,2,3)';
    state.raf.mockImplementation((callback: FrameRequestCallback) => {
      state.frame = callback;
      return 1;
    });
    mountLoader();
    state.frame(16);
    expect(state.ctx.strokeStyle).toMatch(/^rgba\(124, 106, 239,/);
  });

  it('parses a valid hex primary colour', () => {
    state.primary = '#ff0000';
    state.raf.mockImplementation((callback: FrameRequestCallback) => {
      state.frame = callback;
      return 1;
    });
    mountLoader();
    state.frame(16);
    expect(state.ctx.strokeStyle).toMatch(/^rgba\(255, 0, 0,/);
  });

  it('draws a single frame when reduced motion is preferred', () => {
    state.reducedMotion = true;
    mountLoader();
    expect(state.ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(state.raf).not.toHaveBeenCalled();
  });

  it('does nothing when the canvas context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => mountLoader()).not.toThrow();
    expect(state.raf).not.toHaveBeenCalled();
  });
});

describe('animation lifecycle', () => {
  it('advances frames and cancels the pending animation on unmount', () => {
    let frame: FrameRequestCallback | null = null;
    state.raf.mockImplementation((callback: FrameRequestCallback) => {
      frame = callback;
      return 7;
    });
    mountLoader();
    expect(frame).toBeTypeOf('function');

    const clears = (state.ctx.clearRect as unknown as { mock: { calls: unknown[] } }).mock.calls;
    const before = clears.length;
    frame!(16);
    expect(clears.length).toBeGreaterThan(before);
    expect(state.raf).toHaveBeenCalledTimes(2);

    wrapper!.unmount();
    wrapper = null;
    expect(state.cancel).toHaveBeenCalledWith(7);
  });

  it('keeps running the animation when the frame id is zero', () => {
    state.raf.mockReturnValue(0);
    mountLoader();
    wrapper!.unmount();
    wrapper = null;
    expect(state.cancel).not.toHaveBeenCalled();
  });
});
