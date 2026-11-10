import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { Wrench } from '@lucide/vue';

let observerCallback: (() => void) | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

const ResizeObserverStub = class {
  constructor(callback: () => void) {
    observerCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
};

import HomeShelf from '../HomeShelf.vue';

let wrapper: VueWrapper | null = null;

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(HomeShelf, {
    props: { title: 'Shelf', icon: Wrench, itemCount: 2, seeAllLabel: 'See all', ...props },
    slots: { default: '<div data-testid="item">item</div>' },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function scroller() {
  return wrapper!.get('.shelf-scroller').element as HTMLElement;
}

function setMetrics(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  const el = scroller();
  Object.defineProperty(el, 'scrollLeft', { configurable: true, value: scrollLeft });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
}

beforeEach(() => {
  observerCallback = null;
  observe.mockReset();
  disconnect.mockReset();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  if (typeof Element.prototype.scrollBy !== 'function') {
    Object.defineProperty(Element.prototype, 'scrollBy', {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
  }
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('renders the title, icon and slot', () => {
    setup();

    expect(wrapper!.get('[data-testid="home-shelf"]').text()).toContain('Shelf');
    expect(wrapper!.find('[data-testid="item"]').exists()).toBe(true);
    expect(wrapper!.findComponent(Wrench).exists()).toBe(true);
  });

  it('emits see-all when requested', async () => {
    setup();
    const button = wrapper!.findAll('button').find((candidate) => candidate.text() === 'See all')!;

    await button.trigger('click');
    expect(wrapper!.emitted('seeAll')).toHaveLength(1);
  });

  it('omits the see-all button without a label', () => {
    setup({ seeAllLabel: undefined });
    expect(wrapper!.text()).not.toContain('See all');
  });
});

describe('scroll arrows', () => {
  it('shows arrows based on scroll metrics', async () => {
    setup();
    expect(wrapper!.findAll('button')).toHaveLength(1);

    setMetrics(100, 200, 500);
    await wrapper!.get('.shelf-scroller').trigger('scroll');
    await nextTick();

    expect(wrapper!.find('[aria-label="home.scrollLeft"]').exists()).toBe(true);
    expect(wrapper!.find('[aria-label="home.scrollRight"]').exists()).toBe(true);
    expect(wrapper!.get('.shelf-scroller').attributes('style')).toContain(
      '--shelf-fade-left: 2.5rem'
    );

    setMetrics(0, 500, 500);
    await wrapper!.get('.shelf-scroller').trigger('scroll');
    expect(wrapper!.find('[aria-label="home.scrollLeft"]').exists()).toBe(false);
    expect(wrapper!.find('[aria-label="home.scrollRight"]').exists()).toBe(false);
  });

  it('scrolls by a page on arrow clicks', async () => {
    setup();
    setMetrics(100, 300, 900);
    await wrapper!.get('.shelf-scroller').trigger('scroll');
    const scrollBy = vi.spyOn(Element.prototype, 'scrollBy').mockImplementation(() => undefined);

    await wrapper!.get('[aria-label="home.scrollLeft"]').trigger('click');
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -240,
      behavior: 'smooth'
    });

    await wrapper!.get('[aria-label="home.scrollRight"]').trigger('click');
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: 240,
      behavior: 'smooth'
    });
  });

  it('uses a minimum scroll step', async () => {
    setup();
    setMetrics(100, 100, 900);
    await wrapper!.get('.shelf-scroller').trigger('scroll');
    const scrollBy = vi.spyOn(Element.prototype, 'scrollBy').mockImplementation(() => undefined);

    await wrapper!.get('[aria-label="home.scrollRight"]').trigger('click');
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' });
  });

  it('re-evaluates on item count and window resize changes', async () => {
    setup();
    setMetrics(0, 200, 500);

    await wrapper!.setProps({ itemCount: 3 });
    await nextTick();
    await nextTick();
    expect(wrapper!.find('[aria-label="home.scrollRight"]').exists()).toBe(true);

    setMetrics(100, 200, 500);
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(wrapper!.find('[aria-label="home.scrollLeft"]').exists()).toBe(true);
  });
});

describe('resize observer', () => {
  it('observes the scroller and reacts', async () => {
    setup();
    expect(observe).toHaveBeenCalledTimes(1);

    setMetrics(0, 100, 500);
    observerCallback!();
    await nextTick();
    expect(wrapper!.find('[aria-label="home.scrollRight"]').exists()).toBe(true);
  });

  it('disconnects on unmount and removes the resize listener', () => {
    setup();
    const remove = vi.spyOn(window, 'removeEventListener');

    wrapper!.unmount();
    wrapper = null;

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('works without ResizeObserver support', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => setup()).not.toThrow();
  });
});
