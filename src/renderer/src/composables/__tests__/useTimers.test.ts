import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useDebounceFn, useIntervalFn, useRafFn, useTimeoutFn } from '../useTimers';

let wrapper: VueWrapper | null = null;

function withSetup<T>(fn: () => T): T {
  let result!: T;
  const Comp = defineComponent({
    setup() {
      result = fn();
      return () => h('div');
    }
  });
  wrapper = mount(Comp);
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useTimeoutFn', () => {
  it('runs the callback after the delay and supports restart', () => {
    const callback = vi.fn();
    const { start } = withSetup(() => useTimeoutFn(callback, 100));

    start();
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    start();
    vi.advanceTimersByTime(50);
    start();
    vi.advanceTimersByTime(99);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('accepts a delay getter and stops pending callbacks', () => {
    const callback = vi.fn();
    const delay = vi.fn(() => 250);
    const { start, stop } = withSetup(() => useTimeoutFn(callback, delay));

    start();
    expect(delay).toHaveBeenCalled();
    stop();
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });

  it('clears the timer on unmount', () => {
    const callback = vi.fn();
    const { start } = withSetup(() => useTimeoutFn(callback, 100));
    start();
    wrapper!.unmount();
    wrapper = null;
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useIntervalFn', () => {
  it('starts only on resume by default', () => {
    const callback = vi.fn();
    const { resume, pause } = withSetup(() => useIntervalFn(callback, 100));
    vi.advanceTimersByTime(300);
    expect(callback).not.toHaveBeenCalled();

    resume();
    resume();
    vi.advanceTimersByTime(300);
    expect(callback).toHaveBeenCalledTimes(3);

    pause();
    vi.advanceTimersByTime(300);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('runs immediately when requested', () => {
    const callback = vi.fn();
    withSetup(() => useIntervalFn(callback, 100, { immediate: true }));
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('pauses on unmount', () => {
    const callback = vi.fn();
    withSetup(() => useIntervalFn(callback, 100, { immediate: true }));
    wrapper!.unmount();
    wrapper = null;
    vi.advanceTimersByTime(300);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useRafFn', () => {
  let rafCallback: FrameRequestCallback | null;
  let raf: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let hidden: boolean;

  beforeEach(() => {
    rafCallback = null;
    raf = vi.fn((callback: FrameRequestCallback) => {
      rafCallback = callback;
      return 7;
    });
    cancel = vi.fn();
    hidden = false;
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });
  });

  it('runs frames until paused', () => {
    const callback = vi.fn();
    const { pause, resume } = withSetup(() => useRafFn(callback));

    expect(raf).not.toHaveBeenCalled();
    resume();
    expect(raf).toHaveBeenCalledTimes(1);
    rafCallback!(16);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalledTimes(2);

    pause();
    rafCallback!(32);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalled();
  });

  it('does not start while the document is hidden', () => {
    hidden = true;
    const callback = vi.fn();
    const { resume } = withSetup(() => useRafFn(callback));
    resume();
    expect(raf).not.toHaveBeenCalled();
  });

  it('stops rendering when the document becomes hidden', () => {
    const callback = vi.fn();
    const { resume } = withSetup(() => useRafFn(callback));
    resume();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cancel).toHaveBeenCalled();

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('skips callback work when hidden mid-frame', () => {
    const callback = vi.fn();
    const { resume } = withSetup(() => useRafFn(callback));
    resume();
    hidden = true;
    rafCallback!(16);
    expect(callback).not.toHaveBeenCalled();
  });

  it('cleans up on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    withSetup(() => useRafFn(vi.fn()));
    wrapper!.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('useDebounceFn', () => {
  it('runs only the latest call after the wait', () => {
    const fn = vi.fn();
    const debounced = withSetup(() => useDebounceFn(fn as never, 100));

    debounced('a');
    vi.advanceTimersByTime(50);
    debounced('b');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('cancels pending calls', () => {
    const fn = vi.fn();
    const debounced = withSetup(() => useDebounceFn(fn as never, 100));
    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancels on unmount', () => {
    const fn = vi.fn();
    const debounced = withSetup(() => useDebounceFn(fn as never, 100));
    debounced('a');
    wrapper!.unmount();
    wrapper = null;
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
