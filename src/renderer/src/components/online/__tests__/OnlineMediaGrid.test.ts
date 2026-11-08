import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import OnlineMediaGrid from '../OnlineMediaGrid.vue';

const state = vi.hoisted(() => ({
  rowItems: [{ index: 0, start: 40 }] as any[],
  total: 200,
  measureElement: vi.fn(),
  options: null as any,
  observerCallback: null as (() => void) | null,
  observe: vi.fn(),
  disconnect: vi.fn()
}));

vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    state.options = options;
    return ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => state.total,
      measureElement: state.measureElement
    });
  }
}));

let wrapper: VueWrapper | null = null;

function items(count = 5) {
  return Array.from({ length: count }, (_, index) => `item-${index}`);
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineMediaGrid, {
    props: { items: items(), ...props } as never,
    slots: {
      header: () => h('div', { class: 'header' }, 'Header'),
      default: (slotProps: any) => h('span', { class: 'cell' }, slotProps.item),
      footer: () => h('div', { class: 'footer' }, 'Footer')
    }
  });
  return wrapper;
}

function container() {
  return wrapper!.get('.min-h-0');
}

function setLayout(clientWidth: number, scrollTop: number, top = 100, bodyTop = 105) {
  const el = container().element as HTMLElement;
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: scrollTop });
  el.getBoundingClientRect = () => ({ top }) as DOMRect;
  const body = wrapper!.find('.relative').element as HTMLElement;
  body.getBoundingClientRect = () => ({ top: bodyTop }) as DOMRect;
}

beforeEach(() => {
  state.rowItems = [{ index: 0, start: 40 }];
  state.total = 200;
  state.measureElement.mockReset();
  state.options = null;
  state.observerCallback = null;
  state.observe.mockReset();
  state.disconnect.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        state.observerCallback = callback;
      }
      observe = state.observe;
      disconnect = state.disconnect;
    }
  );
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('layout', () => {
  it('computes columns and scroll margin on mount', async () => {
    setup();
    setLayout(800, 5);
    state.observerCallback!();
    await nextTick();

    expect(state.observe).toHaveBeenCalledTimes(2);
    expect(state.options.count()).toBe(Math.ceil(5 / 2));
    expect(state.options.estimateSize()).toBe(300);
    expect(state.options.overscan).toBe(3);
    expect(state.options.scrollMargin()).toBe(10);
  });

  it('respects dense column settings', async () => {
    setup({ colWidth: 100, minCols: 3, paddingPx: 0 });
    setLayout(450, 0);
    state.observerCallback!();
    await nextTick();
    expect(state.options.count()).toBe(Math.ceil(5 / 4));
    expect(wrapper!.html()).toContain('repeat(4, minmax(0, 1fr))');
  });

  it('clamps columns to the minimum', async () => {
    setup({ colWidth: 300, minCols: 2 });
    setLayout(100, 0);
    state.observerCallback!();
    await nextTick();
    expect(state.options.count()).toBe(Math.ceil(5 / 2));
  });

  it('renders virtual rows with margin-adjusted offsets', async () => {
    state.rowItems = [
      { index: 0, start: 40 },
      { index: 1, start: 240 }
    ];
    setup();
    setLayout(800, 5);
    state.observerCallback!();
    await nextTick();

    const rows = wrapper!.findAll('[data-index]');
    expect(rows).toHaveLength(2);
    expect(rows[0].attributes('style')).toContain('translateY(30px)');
    expect(rows[1].attributes('style')).toContain('translateY(230px)');
    expect(wrapper!.findAll('.cell').map((c) => c.text())).toEqual([
      'item-0',
      'item-1',
      'item-2',
      'item-3'
    ]);
  });

  it('slices the last row to the remaining items', async () => {
    state.rowItems = [{ index: 1, start: 40 }];
    setup({ items: items(3), colWidth: 300, minCols: 2 });
    setLayout(800, 0);
    state.observerCallback!();
    await nextTick();
    expect(wrapper!.findAll('.cell')).toHaveLength(1);
  });

  it('renders the header and footer slots', () => {
    setup();
    expect(wrapper!.find('.header').exists()).toBe(true);
    expect(wrapper!.find('.footer').exists()).toBe(true);
    expect(container().classes()).toEqual(expect.arrayContaining(['overflow-y-auto']));
  });

  it('uses the row total height', async () => {
    state.total = 640;
    setup();
    await nextTick();
    expect(wrapper!.find('.relative').attributes('style')).toContain('height: 640px');
  });
});

describe('reactivity', () => {
  it('recomputes when items are added', async () => {
    state.rowItems = [
      { index: 0, start: 40 },
      { index: 1, start: 200 }
    ];
    setup({ items: items(0) });
    setLayout(800, 0);
    state.observerCallback!();
    await nextTick();

    await wrapper!.setProps({ items: items(4) });
    await nextTick();
    await nextTick();
    expect(wrapper!.findAll('.cell')).toHaveLength(4);
  });

  it('ignores empty item lists', async () => {
    setup({ items: items(2) });
    await nextTick();
    await wrapper!.setProps({ items: [] });
    await nextTick();
    expect(wrapper!.findAll('.cell')).toHaveLength(0);
  });

  it('recomputes the margin when sizing props change', async () => {
    setup({ colWidth: 300, minCols: 2 });
    setLayout(800, 0);
    const body = wrapper!.find('.relative').element as HTMLElement;
    body.getBoundingClientRect = () => ({ top: 130 }) as DOMRect;
    await wrapper!.setProps({ colWidth: 200 });
    await nextTick();
    expect(state.options.scrollMargin()).toBe(30);
  });

  it('replaces the old observer on repeated observation', async () => {
    setup();
    expect(state.observe).toHaveBeenCalledTimes(2);
    state.observe.mockClear();
    state.disconnect.mockClear();
    wrapper!.unmount();
    wrapper = null;
    expect(state.disconnect).toHaveBeenCalled();
  });
});

describe('measurement', () => {
  it('measures row elements', async () => {
    setup();
    await nextTick();
    expect(state.measureElement).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('does not measure when no rows are rendered', async () => {
    state.rowItems = [];
    setup();
    await nextTick();
    expect(state.measureElement).not.toHaveBeenCalled();
  });

  it('disconnects on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;
    expect(state.disconnect).toHaveBeenCalled();
  });
});
