import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  useVirtualizer: vi.fn((options: unknown) => ({ options }))
}));

vi.mock('@tanstack/vue-virtual', () => ({ useVirtualizer: state.useVirtualizer }));

import { useVirtualList } from '../useVirtualList';

function lastOptions(): Record<string, unknown> {
  return state.useVirtualizer.mock.calls.at(-1)![0] as Record<string, unknown>;
}

describe('useVirtualList', () => {
  it('provides defaults and evaluates reactive getters', () => {
    const scroll = document.createElement('div');

    const result = useVirtualList({
      count: () => 5,
      scrollEl: () => scroll,
      estimateSize: () => 40
    });

    const options = lastOptions();
    expect(options.count).toBe(5);
    expect((options.getScrollElement as () => HTMLElement)()).toBe(scroll);
    expect((options.estimateSize as () => number)()).toBe(40);
    expect(options.overscan).toBe(3);
    expect(options.horizontal).toBe(false);
    expect(options.scrollMargin).toBe(0);
    expect(options.measureElement).toBeUndefined();
    expect(result).toEqual({ options });
  });

  it('passes through custom options including zero values', () => {
    const measure = vi.fn(() => 20);

    useVirtualList({
      count: () => 0,
      scrollEl: () => null,
      estimateSize: () => 10,
      overscan: 0,
      horizontal: true,
      measureElement: measure,
      scrollMargin: () => 12
    });

    const options = lastOptions();
    expect(options.overscan).toBe(0);
    expect(options.horizontal).toBe(true);
    expect(options.scrollMargin).toBe(12);
    expect(options.measureElement).toBe(measure);
    expect((options.getScrollElement as () => HTMLElement | null)()).toBeNull();
  });
});
