import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Callback = (entries: { target: Element; isIntersecting: boolean }[]) => void;

class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: Callback;
  options?: IntersectionObserverInit;
  observed: Element[] = [];
  unobserved: Element[] = [];

  constructor(callback: Callback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }

  unobserve(el: Element): void {
    this.unobserved.push(el);
  }

  emit(el: Element, isIntersecting: boolean): void {
    this.callback([{ target: el, isIntersecting }]);
  }
}

const el = () => ({ id: 'el' }) as unknown as Element;

let observeIntersection: typeof import('../sharedIntersection').observeIntersection;

beforeEach(async () => {
  FakeObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.resetModules();
  ({ observeIntersection } = await import('../sharedIntersection'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observeIntersection', () => {
  it('observes with a shared observer per root margin', () => {
    const first = el();
    const second = el();

    observeIntersection(first, vi.fn());
    observeIntersection(second, vi.fn());

    expect(FakeObserver.instances).toHaveLength(1);
    expect(FakeObserver.instances[0].options).toEqual({ rootMargin: '0px' });
    expect(FakeObserver.instances[0].observed).toEqual([first, second]);
  });

  it('creates separate observers for different margins', () => {
    observeIntersection(el(), vi.fn(), '100px');
    observeIntersection(el(), vi.fn(), '200px');

    expect(FakeObserver.instances).toHaveLength(2);
    expect(FakeObserver.instances.map((o) => o.options?.rootMargin)).toEqual(['100px', '200px']);
  });

  it('dispatches intersection changes to the latest handler', () => {
    const target = el();
    const first = vi.fn();
    const second = vi.fn();
    observeIntersection(target, first);
    observeIntersection(target, second);

    FakeObserver.instances[0].emit(target, true);
    FakeObserver.instances[0].emit(el(), false);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(true);
  });

  it('stops observing on cleanup', () => {
    const target = el();
    const callback = vi.fn();
    const stop = observeIntersection(target, callback);

    stop();
    FakeObserver.instances[0].emit(target, true);

    expect(FakeObserver.instances[0].unobserved).toEqual([target]);
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns a noop without the Observer API', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    const stop = observeIntersection(el(), vi.fn());

    expect(() => stop()).not.toThrow();
  });
});
