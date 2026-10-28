import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useVirtualGrid } from '../useVirtualGrid';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.callback();
  }
}

function elementWithWidth(width: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  return el;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeResizeObserver.instances = [];
});

describe('useVirtualGrid', () => {
  it('attaches the observer when the grid element appears after mount', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const scrollRef = ref<HTMLElement | null>(null);
    const grid = useVirtualGrid(scrollRef, 100, 6);

    // Domyślny widok to lista: ref jest pusty w chwili onMounted.
    grid.observe();
    expect(FakeResizeObserver.instances).toHaveLength(0);

    const el = elementWithWidth(650);
    scrollRef.value = el;
    await nextTick();
    await nextTick();

    const observer = FakeResizeObserver.instances.at(-1);
    expect(observer?.observed).toContain(el);
    expect(grid.cols.value).toBe(6);

    grid.destroy();
    expect(observer?.disconnected).toBe(true);
  });

  it('recomputes columns when the observed container is resized', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const el = elementWithWidth(650);
    const scrollRef = ref<HTMLElement | null>(el);
    const grid = useVirtualGrid(scrollRef, 100, 6);

    grid.observe();
    expect(grid.cols.value).toBe(6);

    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 420 });
    FakeResizeObserver.instances.at(-1)?.trigger();
    expect(grid.cols.value).toBe(4);

    grid.destroy();
  });
});
