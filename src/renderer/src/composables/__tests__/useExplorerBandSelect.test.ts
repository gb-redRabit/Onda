import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useExplorerBandSelect } from '../useExplorerBandSelect';

const state = vi.hoisted(() => ({
  explorer: null as any,
  clearSelection: vi.fn(),
  raf: vi.fn(),
  cancel: vi.fn(),
  rafCallback: null as (() => void) | null
}));

vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));

let wrapper: VueWrapper | null = null;
let exposed: ReturnType<typeof useExplorerBandSelect>;

function button(path: string, rect: { left: number; top: number; right: number; bottom: number }) {
  const el = document.createElement('button');
  el.setAttribute('data-file-path', path);
  el.getBoundingClientRect = () => rect as DOMRect;
  return el;
}

const buttons = [
  button('a', { left: 0, top: 0, right: 50, bottom: 50 }),
  button('b', { left: 60, top: 60, right: 110, bottom: 110 })
];

function setup(scrollRect: { left: number; top: number } | null = { left: 0, top: 0 }) {
  const scrollRef = ref<HTMLElement | null>(null);
  if (scrollRect) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: scrollRect.left, top: scrollRect.top }) as DOMRect;
    el.querySelectorAll = vi.fn(() => buttons as unknown as NodeListOf<Element>);
    scrollRef.value = el;
  }
  const Comp = defineComponent({
    setup() {
      exposed = useExplorerBandSelect(scrollRef as never, state.explorer as never);
      return () => h('div');
    }
  });
  wrapper = mount(Comp, { attachTo: document.body });
  return wrapper;
}

function mouseDown(target: EventTarget, x = 10, y = 10) {
  const event = new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'target', { value: target });
  exposed.onBandMouseDown(event);
}

function mouseMove(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

beforeEach(() => {
  state.explorer = reactive({
    selectedFiles: new Set<string>(),
    clearSelection: vi.fn(() => state.explorer.selectedFiles.clear())
  });
  state.clearSelection = state.explorer.clearSelection;
  state.rafCallback = null;
  state.raf.mockReset();
  state.raf.mockImplementation((callback: () => void) => {
    state.rafCallback = callback;
    return 7;
  });
  state.cancel.mockReset();
  vi.stubGlobal('requestAnimationFrame', state.raf);
  vi.stubGlobal('cancelAnimationFrame', state.cancel);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('starting the band', () => {
  it('ignores clicks on or inside buttons', () => {
    setup();
    const inside = document.createElement('span');
    const parent = document.createElement('button');
    parent.appendChild(inside);
    mouseDown(parent);
    mouseDown(inside);
    expect(state.clearSelection).not.toHaveBeenCalled();
  });

  it('stops without a scroll container rect', () => {
    setup(null);
    mouseDown(document.body);
    expect(state.clearSelection).toHaveBeenCalled();
    expect(exposed.bandSelect.value).toBeNull();
  });

  it('clears selection and records candidate buttons', () => {
    setup();
    mouseDown(document.body, 5, 5);
    expect(state.clearSelection).toHaveBeenCalled();

    mouseMove(100, 100);
    state.rafCallback!();
    expect(exposed.bandSelect.value).toEqual({ left: 5, top: 5, width: 95, height: 95 });
    expect([...state.explorer.selectedFiles]).toEqual(['a', 'b']);
  });

  it('skips buttons without a path', () => {
    const extra = document.createElement('button');
    extra.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10 }) as DOMRect;
    buttons.push(extra);
    setup();
    mouseDown(document.body, 0, 0);
    mouseMove(120, 120);
    state.rafCallback!();
    expect([...state.explorer.selectedFiles]).toEqual(['a', 'b']);
    buttons.pop();
  });
});

describe('dragging', () => {
  it('ignores movement without an origin', () => {
    setup();
    mouseMove(100, 100);
    expect(state.raf).not.toHaveBeenCalled();
  });

  it('waits for the minimum drag distance', () => {
    setup();
    mouseDown(document.body, 10, 10);

    mouseMove(12, 12);
    expect(state.raf).not.toHaveBeenCalled();

    mouseMove(20, 20);
    expect(state.raf).toHaveBeenCalledTimes(1);
  });

  it('schedules at most one animation frame per drag', () => {
    setup();
    mouseDown(document.body, 10, 10);
    mouseMove(20, 20);
    mouseMove(30, 30);
    expect(state.raf).toHaveBeenCalledTimes(1);
  });

  it('selects only overlapping buttons', () => {
    setup();
    mouseDown(document.body, 0, 0);
    mouseMove(55, 55);
    state.rafCallback!();
    expect([...state.explorer.selectedFiles]).toEqual(['a']);

    state.rafCallback = null;
    mouseMove(120, 120);
    state.rafCallback!();
    expect([...state.explorer.selectedFiles]).toEqual(['a', 'b']);
  });

  it('handles drags upwards and to the left', () => {
    setup();
    mouseDown(document.body, 120, 120);
    mouseMove(50, 50);
    state.rafCallback!();
    expect(exposed.bandSelect.value).toEqual({ left: 50, top: 50, width: 70, height: 70 });
    expect([...state.explorer.selectedFiles]).toEqual(['a', 'b']);
  });

  it('clears the rectangle when the origin disappears during the frame', () => {
    setup();
    mouseDown(document.body, 0, 0);
    mouseMove(50, 50);
    // Simulate a mouseup between scheduling and running the frame.
    document.dispatchEvent(new MouseEvent('mouseup'));
    state.rafCallback!();
    expect(exposed.bandSelect.value).toBeNull();
    expect(state.explorer.selectedFiles.size).toBe(0);
  });
});

describe('ending and cleanup', () => {
  it('cancel a pending frame and resets state on mouseup', () => {
    setup();
    mouseDown(document.body, 0, 0);
    mouseMove(50, 50);
    state.rafCallback = () => ({});

    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(state.cancel).toHaveBeenCalledWith(7);
    expect(exposed.bandSelect.value).toBeNull();
  });

  it('removes document listeners after mouseup', () => {
    setup();
    mouseDown(document.body, 0, 0);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('cleans up pending frames and listeners on unmount', () => {
    setup();
    mouseDown(document.body, 0, 0);
    mouseMove(50, 50);
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    wrapper!.unmount();
    wrapper = null;
    expect(state.cancel).toHaveBeenCalledWith(7);
    expect(exposed.bandSelect.value).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('unmounts cleanly without a pending frame', () => {
    setup();
    expect(() => wrapper!.unmount()).not.toThrow();
  });
});
