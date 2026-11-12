import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, nextTick } from 'vue';

const h = vi.hoisted(() => ({
  store: null as any
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.store }));

import { useChannelInfiniteScroll } from '../useChannelInfiniteScroll';

type Api = ReturnType<typeof useChannelInfiniteScroll>;

class MockObserver {
  static instances: MockObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockObserver.instances.push(this);
  }
}

let wrapper: VueWrapper | null = null;
let api: Api;

function setup() {
  const Host = defineComponent({
    setup() {
      api = useChannelInfiniteScroll();
      return { api };
    },
    template: '<div data-testid="host"></div>'
  });
  wrapper = mount(Host);
  return wrapper;
}

function sentinel(top = 0): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ top }) as DOMRect;
  return el;
}

function intersect(entry: Partial<IntersectionObserverEntry> = {}) {
  MockObserver.instances[0].callback(
    [{ isIntersecting: true, ...entry } as IntersectionObserverEntry],
    {} as IntersectionObserver
  );
}

beforeEach(() => {
  MockObserver.instances = [];
  h.store = reactive({
    channelLoading: false,
    channelHasMore: true,
    loadMoreChannel: vi.fn(async () => undefined)
  });
  vi.stubGlobal('IntersectionObserver', MockObserver);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('observer lifecycle', () => {
  it('creates the observer on mount', () => {
    setup();

    expect(MockObserver.instances).toHaveLength(1);
    expect(MockObserver.instances[0].options).toEqual({ root: null, rootMargin: '200px 0px' });
  });

  it('observes an element passed to setSentinel', () => {
    setup();
    const el = sentinel();

    api.setSentinel(el);

    expect(MockObserver.instances[0].observe).toHaveBeenCalledWith(el);
  });

  it('disconnects before observing a replacement element', () => {
    setup();
    const first = sentinel();
    const second = sentinel();

    api.setSentinel(first);
    api.setSentinel(second);

    expect(MockObserver.instances[0].disconnect).toHaveBeenCalledTimes(2);
    expect(MockObserver.instances[0].observe).toHaveBeenLastCalledWith(second);
  });

  it('clears the sentinel for non-element values', () => {
    setup();
    api.setSentinel(sentinel());

    api.setSentinel({ $el: document.createElement('div') } as never);
    intersect();

    expect(h.store.loadMoreChannel).not.toHaveBeenCalled();
    expect(MockObserver.instances[0].disconnect).toHaveBeenCalledTimes(2);
  });

  it('disconnects on unmount', () => {
    setup();
    const observer = MockObserver.instances[0];

    wrapper!.unmount();
    wrapper = null;

    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('ignores setSentinel after unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;

    api.setSentinel(sentinel());

    expect(MockObserver.instances[0].observe).not.toHaveBeenCalled();
  });
});

describe('maybeLoadMore', () => {
  it('loads when intersecting near the viewport', () => {
    setup();
    api.setSentinel(sentinel());

    intersect();

    expect(h.store.loadMoreChannel).toHaveBeenCalledTimes(1);
  });

  it('ignores non-intersecting entries', () => {
    setup();
    api.setSentinel(sentinel());

    intersect({ isIntersecting: false });

    expect(h.store.loadMoreChannel).not.toHaveBeenCalled();
  });

  it('stops when there is no next page or a load is running', () => {
    setup();
    api.setSentinel(sentinel());

    h.store.channelHasMore = false;
    intersect();
    h.store.channelHasMore = true;
    h.store.channelLoading = true;
    intersect();

    expect(h.store.loadMoreChannel).not.toHaveBeenCalled();
  });

  it('stops when the sentinel is far below the viewport', () => {
    setup();
    api.setSentinel(sentinel(window.innerHeight + 500));

    api.maybeLoadMore();

    expect(h.store.loadMoreChannel).not.toHaveBeenCalled();
  });

  it('does nothing without a sentinel', () => {
    setup();

    api.maybeLoadMore();

    expect(h.store.loadMoreChannel).not.toHaveBeenCalled();
  });

  it('re-checks after a page finishes loading', async () => {
    setup();
    api.setSentinel(sentinel());

    h.store.channelLoading = true;
    await nextTick();
    expect(h.store.loadMoreChannel).not.toHaveBeenCalled();

    h.store.channelLoading = false;
    await nextTick();

    expect(h.store.loadMoreChannel).toHaveBeenCalledTimes(1);
  });
});
