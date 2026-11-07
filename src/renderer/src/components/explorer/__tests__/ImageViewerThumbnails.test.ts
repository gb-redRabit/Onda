import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import type { FileItem } from '@renderer/types/explorer';
import ImageViewerThumbnails from '../ImageViewerThumbnails.vue';

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  io: null as any,
  observers: [] as any[],
  scrollTo: vi.fn()
}));

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnect = vi.fn();
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = cb;
    this.options = options;
    state.io = this;
    state.observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
}

let wrapper: VueWrapper | null = null;

function file(index: number): FileItem {
  return {
    name: `image-${index}.png`,
    path: `C:/images/${index}.png`,
    isDirectory: false,
    extension: 'png',
    size: 100
  } as FileItem;
}

function files(count: number) {
  return Array.from({ length: count }, (_, i) => file(i));
}

function mountThumbs(props: Record<string, unknown> = {}) {
  wrapper = mount(ImageViewerThumbnails, {
    props: {
      files: files(5),
      currentIndex: 0,
      thumbCache: reactive(new Map<string, string>()),
      visible: true,
      showThumbs: true,
      scale: 1,
      rotation: 0,
      currentFile: file(0),
      ...props
    } as never,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      directives: { activate: {} }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({});
  state.io = null;
  state.observers = [];
  state.scrollTo.mockReset();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  HTMLElement.prototype.scrollTo = state.scrollTo as never;
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('layout', () => {
  it('collapses when not visible and shows the footer', async () => {
    mountThumbs({ visible: false });
    await flush();

    const root = wrapper!.find('.shrink-0');
    expect(root.classes()).toContain('max-h-0');
    expect(root.classes()).toContain('opacity-0');
    expect(wrapper!.get('[data-testid="image-viewer-counter"]').text()).toBe('1 / 5');
  });

  it('hides the strip for a single file but keeps the footer', async () => {
    mountThumbs({ files: files(1), currentFile: file(0) });
    await flush();
    expect(wrapper!.findAll('[data-testid="image-viewer-strip"]')).toHaveLength(0);
    expect(wrapper!.get('[data-testid="image-viewer-counter"]').text()).toBe('1 / 1');
  });

  it('renders a 61-thumbnail window around the current index', async () => {
    mountThumbs({ files: files(100), currentIndex: 50, currentFile: file(50) });
    await flush();
    const thumbs = wrapper!.findAll('[data-thumb-idx]');
    expect(thumbs).toHaveLength(61);
    expect(thumbs[0].attributes('data-thumb-idx')).toBe('20');
    expect(thumbs.at(-1)!.attributes('data-thumb-idx')).toBe('80');
    expect(wrapper!.find('.relative.h-full').attributes('style')).toContain('6800px');
  });

  it('clamps the window at the start and end', async () => {
    mountThumbs({ files: files(100), currentIndex: 0, currentFile: file(0) });
    await flush();
    expect(wrapper!.findAll('[data-thumb-idx]')).toHaveLength(31);

    await wrapper!.setProps({ currentIndex: 99, currentFile: file(99) });
    await flush();
    expect(wrapper!.findAll('[data-thumb-idx]')).toHaveLength(31);
  });

  it('marks the active thumbnail and shows cached images', async () => {
    const cache = reactive(new Map<string, string>());
    mountThumbs({ thumbCache: cache, currentIndex: 1, currentFile: file(1) });
    await flush();

    const thumbs = wrapper!.findAll('[data-thumb-idx]');
    expect(thumbs[1].classes()).toContain('border-primary');
    expect(thumbs[0].find('span').text()).toBe('1');

    cache.set(file(0).path, 'data:image/png;base64,x');
    await flush();
    expect(thumbs[0].find('img').attributes('src')).toBe('data:image/png;base64,x');
    expect(thumbs[0].classes()).toContain('brightness-50');
  });

  it('shows scale and rotation only when transformed', async () => {
    mountThumbs({ scale: 1.5, rotation: 90 });
    await flush();
    expect(wrapper!.get('[data-testid="image-viewer-scale"]').text()).toBe('150%');
    expect(wrapper!.get('[data-testid="image-viewer-rotation"]').text()).toBe('90°');

    await wrapper!.setProps({ scale: 1, rotation: 0 });
    await flush();
    expect(wrapper!.findAll('[data-testid="image-viewer-scale"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="image-viewer-rotation"]')).toHaveLength(0);
  });

  it('toggles thumbnails and navigates', async () => {
    mountThumbs();
    await flush();

    await wrapper!.get('[data-testid="image-viewer-thumbnails-toggle"]').trigger('click');
    expect(wrapper!.emitted('update:showThumbs')?.[0]).toEqual([false]);

    await wrapper!.findAll('[data-thumb-idx]')[2].trigger('click');
    expect(wrapper!.emitted('goTo')?.[0]).toEqual([2]);
  });

  it('scrolls the strip to the active thumbnail', async () => {
    mountThumbs({ currentIndex: 3, currentFile: file(3) });
    await flush();
    expect(state.scrollTo).toHaveBeenCalledWith({
      left: 3 * 68 - 0 + 32,
      behavior: 'smooth'
    });
  });
});

describe('thumbnail loading', () => {
  it('batches intersection requests and stores results', async () => {
    const cache = reactive(new Map<string, string>());
    mountThumbs({ thumbCache: cache });
    await flush();
    const observer = state.io;
    expect(observer.options).toMatchObject({ rootMargin: '100px' });

    observer.callback(
      [
        { isIntersecting: true, target: { getAttribute: () => '2' } },
        { isIntersecting: false, target: { getAttribute: () => '3' } }
      ] as never,
      observer as never
    );
    await vi.advanceTimersByTimeAsync(40);
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('media:batchThumbnails', [file(2).path], 320);
    expect(cache.get(file(2).path)).toBe('');
  });

  it('stores returned data URLs and ignores missing entries', async () => {
    const cache = reactive(new Map<string, string>());
    mountThumbs({ thumbCache: cache });
    await flush();
    state.invoke.mockResolvedValueOnce({ [file(2).path]: 'data:thumb' });
    state.io.callback(
      [
        { isIntersecting: true, target: { getAttribute: () => '2' } },
        { isIntersecting: true, target: { getAttribute: () => '3' } }
      ] as never,
      state.io as never
    );
    await vi.advanceTimersByTimeAsync(40);
    await flush();
    expect(cache.get(file(2).path)).toBe('data:thumb');
  });

  it('deduplicates pending paths and ignores cached ones', async () => {
    const cache = reactive(new Map<string, string>());
    cache.set(file(2).path, 'cached');
    mountThumbs({ thumbCache: cache });
    await flush();

    state.io.callback(
      [
        { isIntersecting: true, target: { getAttribute: () => '2' } },
        { isIntersecting: true, target: { getAttribute: () => '4' } },
        { isIntersecting: true, target: { getAttribute: () => '4' } },
        { isIntersecting: true, target: { getAttribute: () => '99' } }
      ] as never,
      state.io as never
    );
    await vi.advanceTimersByTimeAsync(40);
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke.mock.calls[0][1]).toEqual([file(4).path]);
  });

  it('swallows batch failures and does nothing without the API', async () => {
    mountThumbs();
    await flush();
    state.invoke.mockRejectedValueOnce(new Error('batch'));
    state.io.callback(
      [{ isIntersecting: true, target: { getAttribute: () => '1' } }] as never,
      state.io as never
    );
    await vi.advanceTimersByTimeAsync(40);
    await flush();

    wrapper!.unmount();
    delete (window as { api?: unknown }).api;
    mountThumbs();
    await flush();
    state.io.callback(
      [{ isIntersecting: true, target: { getAttribute: () => '1' } }] as never,
      state.io as never
    );
    await vi.advanceTimersByTimeAsync(40);
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });

  it('preloads nearby thumbnails when the index changes', async () => {
    mountThumbs();
    await flush();
    state.invoke.mockClear();
    await wrapper!.setProps({ currentIndex: 2, currentFile: file(2) });
    await flush();
    await vi.advanceTimersByTimeAsync(40);

    expect(state.invoke).toHaveBeenCalled();
    const paths = state.invoke.mock.calls[0][1] as string[];
    expect(paths.length).toBeGreaterThan(0);
  });

  it('re-observes when thumbnails are shown or the file list changes', async () => {
    mountThumbs({ showThumbs: false });
    await flush();
    const initial = state.observers.length;

    await wrapper!.setProps({ showThumbs: true });
    await flush();
    expect(state.observers.length).toBeGreaterThan(initial);

    const before = state.observers.length;
    await wrapper!.setProps({ files: files(6) });
    await flush();
    expect(state.observers.length).toBeGreaterThan(before);
  });

  it('disconnects and clears the pending batch on unmount', async () => {
    mountThumbs();
    await flush();
    state.io.callback(
      [{ isIntersecting: true, target: { getAttribute: () => '1' } }] as never,
      state.io as never
    );

    wrapper!.unmount();
    wrapper = null;
    expect(state.io.disconnect).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(40);
    expect(state.invoke).not.toHaveBeenCalled();
  });
});
