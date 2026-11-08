import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useImageViewer } from '../useImageViewer';

const state = vi.hoisted(() => ({
  timers: [] as any[],
  debounce: null as any,
  keyOptions: null as any,
  keyHandler: vi.fn(),
  image: null as any,
  transition: null as any,
  slideshow: null as any,
  loggerError: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));
vi.mock('../useTimers', () => ({
  useTimeoutFn: (callback: () => void, ms: number) => {
    const entry = { callback, ms, start: vi.fn(), stop: vi.fn() };
    state.timers.push(entry);
    return { start: entry.start, stop: entry.stop };
  },
  useDebounceFn: (callback: (...args: any[]) => void, ms: number) => {
    state.debounce = { callback, ms };
    return state.keyHandler;
  }
}));
vi.mock('../useImageViewerImage', () => ({
  useImageViewerImage: () => state.image
}));
vi.mock('../useImageViewerTransition', () => ({
  useImageViewerTransition: () => state.transition
}));
vi.mock('../useImageViewerSlideshow', () => ({
  useImageViewerSlideshow: () => state.slideshow
}));
vi.mock('../useImageViewerKeyboard', () => ({
  createImageKeyHandler: (options: unknown) => {
    state.keyOptions = options;
    return state.keyHandler;
  }
}));

function file(path: string) {
  return { path, name: path.split('/').pop() } as any;
}

const files = [file('a.png'), file('b.png'), file('c.png')];

let wrapper: VueWrapper | null = null;
let exposed: any;
let emit: { close: ReturnType<typeof vi.fn> };
let props: any;
let invoke: ReturnType<typeof vi.fn>;
let on: ReturnType<typeof vi.fn>;
let cleanup: ReturnType<typeof vi.fn>;

function mountViewer(initialIndex = 0) {
  props = reactive({ files: [...files], initialIndex });
  emit = { close: vi.fn() };
  const Comp = defineComponent({
    setup() {
      exposed = useImageViewer(props, emit as { close: () => void });
      return () => h('div');
    }
  });
  wrapper = mount(Comp);
  return wrapper;
}

beforeEach(() => {
  state.timers = [];
  state.debounce = null;
  state.keyOptions = null;
  state.keyHandler = vi.fn();
  state.keyHandler.mockReset();
  state.loggerError.mockReset();

  state.image = {
    displaySrc: ref('a.png'),
    usingHighRes: ref(false),
    kenStyle: ref({}),
    loadAt: vi.fn(),
    preloadNext: vi.fn(),
    loadInitial: vi.fn().mockResolvedValue(undefined),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    rotate: vi.fn(),
    fitToScreen: vi.fn(),
    makeTransform: vi.fn(() => 'transform')
  };
  state.transition = {
    oldSrc: ref(''),
    imgError: ref(false),
    transitionType: ref('fade'),
    transitionDuration: ref(300),
    newStyle: ref({}),
    oldStyle: ref({}),
    navigateTo: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    goTo: vi.fn(),
    stopTransition: vi.fn(),
    onImageLoaded: vi.fn(),
    onImageError: vi.fn()
  };
  state.slideshow = {
    slideshowActive: ref(false),
    slideshowInterval: ref(5),
    slideshowProgress: ref(0),
    kenBurns: ref(false),
    shuffleSlideshow: ref(false),
    autoHideUI: ref(true),
    stopSlideshow: vi.fn(),
    toggleSlideshow: vi.fn(),
    changeInterval: vi.fn()
  };

  invoke = vi.fn().mockResolvedValue(false);
  cleanup = vi.fn();
  on = vi.fn().mockReturnValue(cleanup);
  (window as { api?: unknown }).api = { invoke, on };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('initial view', () => {
  it('exposes the current index and file', () => {
    mountViewer(1);
    expect(exposed.currentIndex.value).toBe(1);
    expect(exposed.currentFile.value).toEqual(files[1]);
    expect(exposed.hasPrev.value).toBe(true);
    expect(exposed.hasNext.value).toBe(true);
    expect(exposed.displaySrc.value).toBe('a.png');
    expect(exposed.thumbCache.value).toBeInstanceOf(Map);
  });

  it('computes prev/next with loop enabled', () => {
    mountViewer(0);
    expect(exposed.hasPrev.value).toBe(false);
    exposed.loop.value = true;
    expect(exposed.hasPrev.value).toBe(true);
    expect(exposed.hasNext.value).toBe(true);
    exposed.currentIndex.value = files.length - 1;
    expect(exposed.hasNext.value).toBe(true);
    exposed.loop.value = false;
    expect(exposed.hasNext.value).toBe(false);
  });

  it('returns null when the index points past the files', () => {
    mountViewer(9);
    expect(exposed.currentFile.value).toBeNull();
  });

  it('reacts to new file lists and initial indexes', async () => {
    mountViewer(0);
    state.image.loadInitial.mockClear();

    props.initialIndex = 2;
    await nextTick();
    expect(exposed.currentIndex.value).toBe(2);
    expect(state.image.loadInitial).toHaveBeenCalled();

    state.image.loadInitial.mockClear();
    props.files = [];
    await nextTick();
    expect(state.image.loadInitial).not.toHaveBeenCalled();
  });
});

describe('mounted lifecycle', () => {
  it('registers listeners and restores fullscreen state', async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === 'window:isFullscreen' ? true : false
    );
    mountViewer();
    await nextTick();

    expect(invoke).toHaveBeenCalledWith('window:isFullscreen');
    expect(on).toHaveBeenCalledWith('window:fullscreenChanged', expect.any(Function));
    expect(exposed.fullscreen.value).toBe(true);
    expect(state.image.loadInitial).toHaveBeenCalled();
  });

  it('logs fullscreen lookup failures', async () => {
    invoke.mockRejectedValueOnce(new Error('ipc'));
    mountViewer();
    await nextTick();
    await Promise.resolve();
    expect(state.loggerError).toHaveBeenCalledWith(
      'ImageViewer',
      'isFullscreen',
      expect.any(Error)
    );
  });

  it('works without the preload bridge', () => {
    delete (window as { api?: unknown }).api;
    expect(() => mountViewer()).not.toThrow();
  });

  it('tracks fullscreen change events', async () => {
    mountViewer();
    const handler = on.mock.calls[0][1];
    handler(true);
    expect(exposed.fullscreen.value).toBe(true);
    handler(0);
    expect(exposed.fullscreen.value).toBe(false);
  });
});

describe('keyboard and wheel', () => {
  it('builds the key handler with current state', () => {
    mountViewer(1);
    const options = state.keyOptions;
    expect(options.settingsOpen).toBe(exposed.settingsOpen);
    expect(options.uiVisible).toBe(exposed.uiVisible);
    expect(options.slideshowActive).toBe(state.slideshow.slideshowActive);
    expect(options.hasPrev.value).toBe(true);
    expect(options.hasNext.value).toBe(true);

    options.prev();
    expect(state.transition.prev).toHaveBeenCalledWith(exposed.hasPrev);
    options.next();
    expect(state.transition.next).toHaveBeenCalledWith(exposed.hasNext);
    options.zoomIn();
    options.zoomOut();
    options.rotate();
    options.toggleFullscreen();
    options.stopIdle();
    options.toggleSlideshow();
    options.handleClose();
    expect(state.image.zoomIn).toHaveBeenCalled();
    expect(state.image.zoomOut).toHaveBeenCalled();
    expect(state.image.rotate).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('window:toggleFullscreen');
    expect(state.slideshow.toggleSlideshow).toHaveBeenCalled();
    expect(emit.close).toHaveBeenCalled();
  });

  it('debounces wheel zoom by direction', () => {
    mountViewer();
    exposed.onWheel({ deltaY: -120 } as WheelEvent);
    exposed.onWheel({ deltaY: 120 } as WheelEvent);
    expect(state.debounce.ms).toBe(50);
    state.debounce.callback(-1);
    expect(state.image.zoomIn).toHaveBeenCalled();
    state.debounce.callback(1);
    expect(state.image.zoomOut).toHaveBeenCalled();
  });

  it('wires the window keydown listener to the handler', () => {
    mountViewer();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    window.dispatchEvent(event);
    expect(state.keyHandler).toHaveBeenCalledWith(event);
  });
});

describe('idle UI', () => {
  it('starts the idle timer only during auto-hiding slideshows', () => {
    mountViewer();
    const idle = state.timers[0];
    window.dispatchEvent(new MouseEvent('mousemove'));
    expect(exposed.uiVisible.value).toBe(true);
    expect(idle.start).not.toHaveBeenCalled();

    state.slideshow.slideshowActive.value = true;
    window.dispatchEvent(new MouseEvent('mousemove'));
    expect(idle.stop).toHaveBeenCalled();
    expect(idle.start).toHaveBeenCalled();

    state.slideshow.autoHideUI.value = false;
    idle.start.mockClear();
    window.dispatchEvent(new MouseEvent('mousemove'));
    expect(idle.start).not.toHaveBeenCalled();
  });

  it('hides the UI when the idle callback fires', () => {
    mountViewer();
    state.timers[0].callback();
    expect(exposed.uiVisible.value).toBe(false);
  });
});

describe('fullscreen and close', () => {
  it('toggles fullscreen through IPC', async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === 'window:toggleFullscreen' ? true : false
    );
    mountViewer();
    exposed.toggleFullscreen();
    await nextTick();
    expect(exposed.fullscreen.value).toBe(true);
  });

  it('logs toggle failures', async () => {
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'window:toggleFullscreen') throw new Error('ipc');
      return false;
    });
    mountViewer();
    exposed.toggleFullscreen();
    await nextTick();
    await Promise.resolve();
    expect(state.loggerError).toHaveBeenCalledWith(
      'ImageViewer',
      'toggleFullscreen',
      expect.any(Error)
    );
  });

  it('stops slideshow and fullscreen before closing', () => {
    mountViewer();
    state.slideshow.slideshowActive.value = true;
    exposed.fullscreen.value = true;
    exposed.handleClose();
    expect(state.slideshow.stopSlideshow).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('window:exitFullscreen');
    expect(emit.close).toHaveBeenCalled();
  });

  it('closes without side effects when idle and windowed', () => {
    mountViewer();
    exposed.handleClose();
    expect(state.slideshow.stopSlideshow).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('window:exitFullscreen');
    expect(emit.close).toHaveBeenCalled();
  });
});

describe('navigation helpers', () => {
  it('forwards navigation and zoom helpers', () => {
    mountViewer(1);
    exposed.prev();
    expect(state.transition.prev).toHaveBeenCalledWith(exposed.hasPrev);
    exposed.next();
    expect(state.transition.next).toHaveBeenCalledWith(exposed.hasNext);
    exposed.goTo(2);
    expect(state.transition.goTo).toHaveBeenCalledWith(2);
    exposed.zoomIn();
    exposed.zoomOut();
    exposed.rotate();
    exposed.fitToScreen();
    expect(state.image.zoomIn).toHaveBeenCalled();
    expect(state.image.zoomOut).toHaveBeenCalled();
    expect(state.image.rotate).toHaveBeenCalled();
    expect(state.image.fitToScreen).toHaveBeenCalled();
    exposed.changeInterval(10);
    expect(state.slideshow.changeInterval).toHaveBeenCalledWith(10);
    expect(exposed.makeTransform()).toBe('transform');
    exposed.onImageLoaded();
    exposed.onImageError();
    expect(state.transition.onImageLoaded).toHaveBeenCalled();
    expect(state.transition.onImageError).toHaveBeenCalled();
  });

  it('passes the slideshow dependencies', () => {
    mountViewer(1);
    // useImageViewerSlideshow is called during setup; assert via exposed values.
    expect(exposed.slideshowInterval.value).toBe(5);
    expect(exposed.slideshowProgress.value).toBe(0);
    expect(exposed.kenBurns.value).toBe(false);
    expect(exposed.shuffleSlideshow.value).toBe(false);
    expect(exposed.autoHideUI.value).toBe(true);
  });
});

describe('unmount', () => {
  it('removes listeners, cleans subscriptions and stops transitions', () => {
    mountViewer();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    wrapper!.unmount();
    wrapper = null;

    expect(removeSpy).toHaveBeenCalledWith('keydown', state.keyHandler);
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(cleanup).toHaveBeenCalled();
    expect(state.slideshow.stopSlideshow).toHaveBeenCalled();
    expect(state.transition.stopTransition).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('window:exitFullscreen');
  });

  it('exits fullscreen when it was active', () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === 'window:isFullscreen' ? true : false
    );
    mountViewer();
    return nextTick().then(() => {
      wrapper!.unmount();
      wrapper = null;
      expect(invoke).toHaveBeenCalledWith('window:exitFullscreen');
    });
  });
});
