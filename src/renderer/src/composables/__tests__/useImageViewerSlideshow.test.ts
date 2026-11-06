import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { FileItem } from '@renderer/types/explorer';

// Slajdy: timery są w pełni sterowane, a shuffle deterministyczny.
const state = vi.hoisted(() => ({
  intervalCb: null as null | (() => void),
  rafCb: null as null | (() => void),
  advanceCb: null as null | (() => void),
  pauseProgress: vi.fn(),
  resumeProgress: vi.fn(),
  pauseKen: vi.fn(),
  resumeKen: vi.fn(),
  startAdvance: vi.fn(),
  stopAdvance: vi.fn(),
  shuffled: vi.fn((items: number[]) => items)
}));

vi.mock('../useTimers', () => ({
  useIntervalFn: (callback: () => void) => {
    state.intervalCb = callback;
    return { pause: state.pauseProgress, resume: state.resumeProgress };
  },
  useRafFn: (callback: () => void) => {
    state.rafCb = callback;
    return { pause: state.pauseKen, resume: state.resumeKen };
  },
  useTimeoutFn: (callback: () => void) => {
    state.advanceCb = callback;
    return { start: state.startAdvance, stop: state.stopAdvance };
  }
}));
vi.mock('@renderer/utils/shuffle', () => ({
  shuffled: (items: number[]) => state.shuffled(items)
}));

const { useImageViewerSlideshow } = await import('../useImageViewerSlideshow');

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    files: [{ path: '/a.jpg' }, { path: '/b.jpg' }, { path: '/c.jpg' }] as FileItem[],
    currentIndex: ref(0),
    hasNext: ref(true),
    loop: ref(false),
    uiVisible: ref(false),
    showBottom: ref(false),
    settingsOpen: ref(true),
    usingHighRes: ref(false),
    kenStyle: { scale: 1, translateX: 0, translateY: 0 },
    navigate: vi.fn(),
    next: vi.fn(),
    loadAt: vi.fn(),
    resetIdleTimer: vi.fn(),
    stopIdle: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  state.pauseProgress.mockClear();
  state.resumeProgress.mockClear();
  state.pauseKen.mockClear();
  state.resumeKen.mockClear();
  state.startAdvance.mockClear();
  state.stopAdvance.mockClear();
  state.shuffled.mockReset();
  state.shuffled.mockImplementation((items: number[]) => items);
});

describe('progress', () => {
  it('derives the progress step from the interval', () => {
    const slideshow = useImageViewerSlideshow(makeDeps());

    state.intervalCb!();
    expect(slideshow.slideshowProgress.value).toBeCloseTo(100 / (3000 / 16));

    slideshow.slideshowProgress.value = 0;
    slideshow.changeInterval(1600);
    state.intervalCb!();
    expect(slideshow.slideshowProgress.value).toBeCloseTo(1);
  });

  it('resets and resumes progress', () => {
    const slideshow = useImageViewerSlideshow(makeDeps());
    slideshow.slideshowProgress.value = 42;

    slideshow.runProgress();

    expect(state.pauseProgress).toHaveBeenCalled();
    expect(slideshow.slideshowProgress.value).toBe(0);
    expect(state.resumeProgress).toHaveBeenCalled();
    expect(state.resumeKen).not.toHaveBeenCalled();
  });

  it('advances progress up to 100 and resumes the Ken Burns loop', () => {
    const slideshow = useImageViewerSlideshow(makeDeps());
    slideshow.kenBurns.value = true;
    slideshow.runProgress();
    expect(state.resumeKen).toHaveBeenCalled();

    state.intervalCb!();
    expect(slideshow.slideshowProgress.value).toBeGreaterThan(0);

    slideshow.slideshowProgress.value = 99.9;
    state.intervalCb!();
    expect(slideshow.slideshowProgress.value).toBe(100);
  });
});

describe('start and stop', () => {
  it('starts with UI reset and schedules the first advance', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);

    slideshow.startSlideshow();

    expect(slideshow.slideshowActive.value).toBe(true);
    expect(deps.settingsOpen.value).toBe(false);
    expect(deps.showBottom.value).toBe(false);
    expect(deps.uiVisible.value).toBe(true);
    expect(deps.resetIdleTimer).toHaveBeenCalled();
    expect(state.resumeProgress).toHaveBeenCalled();
    expect(state.startAdvance).toHaveBeenCalled();
  });

  it('does not reset the idle timer when auto-hide is off', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.autoHideUI.value = false;

    slideshow.startSlideshow();

    expect(deps.resetIdleTimer).not.toHaveBeenCalled();
  });

  it('immediately stops with fewer than two files', () => {
    const deps = makeDeps({ files: [{ path: '/only.jpg' }] as FileItem[] });
    const slideshow = useImageViewerSlideshow(deps);

    slideshow.startSlideshow();

    expect(slideshow.slideshowActive.value).toBe(false);
    expect(deps.showBottom.value).toBe(true);
    expect(deps.stopIdle).toHaveBeenCalled();
    expect(state.stopAdvance).toHaveBeenCalled();
    expect(state.pauseProgress).toHaveBeenCalled();
    expect(state.pauseKen).toHaveBeenCalled();
    expect(state.startAdvance).not.toHaveBeenCalled();
  });

  it('stops, restores chrome and resets Ken Burns offsets', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.startSlideshow();
    slideshow.slideshowProgress.value = 60;
    deps.kenStyle.scale = 1.2;
    deps.kenStyle.translateX = 5;
    deps.kenStyle.translateY = 2;

    slideshow.stopSlideshow();

    expect(slideshow.slideshowActive.value).toBe(false);
    expect(slideshow.slideshowProgress.value).toBe(0);
    expect(deps.showBottom.value).toBe(true);
    expect(deps.uiVisible.value).toBe(true);
    expect(deps.stopIdle).toHaveBeenCalled();
    expect(deps.kenStyle).toEqual({ scale: 1, translateX: 0, translateY: 0 });
    expect(state.pauseKen).toHaveBeenCalled();
    expect(state.stopAdvance).toHaveBeenCalled();
    expect(state.pauseProgress).toHaveBeenCalled();
  });

  it('toggles between running and stopped', () => {
    const slideshow = useImageViewerSlideshow(makeDeps());
    slideshow.toggleSlideshow();
    expect(slideshow.slideshowActive.value).toBe(true);
    slideshow.toggleSlideshow();
    expect(slideshow.slideshowActive.value).toBe(false);
  });

  it('restarts when the interval changes during a slideshow', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.startSlideshow();
    state.startAdvance.mockClear();

    slideshow.changeInterval(5000);

    expect(slideshow.slideshowInterval.value).toBe(5000);
    expect(state.stopAdvance).toHaveBeenCalled();
    expect(state.startAdvance).toHaveBeenCalled();
    expect(deps.resetIdleTimer).toHaveBeenCalledTimes(2);
  });

  it('only stores the interval when the slideshow is stopped', () => {
    const slideshow = useImageViewerSlideshow(makeDeps());
    slideshow.changeInterval(1000);
    expect(slideshow.slideshowInterval.value).toBe(1000);
    expect(state.startAdvance).not.toHaveBeenCalled();
  });
});

describe('advancing', () => {
  it('advances to the next file while one exists', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.startSlideshow();

    state.advanceCb!();

    expect(deps.next).toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.loadAt).not.toHaveBeenCalled();
    expect(state.startAdvance).toHaveBeenCalledTimes(2);
  });

  it('loops to the first file at the end when looping', () => {
    const deps = makeDeps({ hasNext: ref(false), loop: ref(true) });
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.startSlideshow();

    state.advanceCb!();

    expect(deps.loadAt).toHaveBeenCalledWith(0);
    expect(state.startAdvance).toHaveBeenCalledTimes(2);
  });

  it('stops at the end without looping', () => {
    const deps = makeDeps({ hasNext: ref(false), loop: ref(false) });
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.startSlideshow();

    state.advanceCb!();

    expect(slideshow.slideshowActive.value).toBe(false);
    expect(deps.stopIdle).toHaveBeenCalled();
    expect(deps.loadAt).not.toHaveBeenCalled();
    expect(state.startAdvance).toHaveBeenCalledTimes(1);
  });

  it('ignores an advance after the slideshow was stopped', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.startSlideshow();
    slideshow.stopSlideshow();
    state.startAdvance.mockClear();

    state.advanceCb!();

    expect(deps.next).not.toHaveBeenCalled();
    expect(state.startAdvance).not.toHaveBeenCalled();
  });

  it('walks a shuffled order before falling back to hasNext', () => {
    state.shuffled.mockReturnValue([2, 1]);
    const deps = makeDeps({ currentIndex: ref(0) });
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.shuffleSlideshow.value = true;
    slideshow.startSlideshow();

    state.advanceCb!();
    expect(deps.navigate).toHaveBeenCalledWith(2, 'next');
    state.advanceCb!();
    expect(deps.navigate).toHaveBeenLastCalledWith(1, 'next');

    state.advanceCb!();
    expect(deps.next).toHaveBeenCalled();
  });

  it('excludes the current index from the shuffled order', () => {
    state.shuffled.mockReturnValue([0, 2]);
    const deps = makeDeps({ currentIndex: ref(1) });
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.shuffleSlideshow.value = true;
    slideshow.startSlideshow();

    expect(state.shuffled).toHaveBeenCalledWith([0, 2]);
  });
});

describe('Ken Burns', () => {
  it('updates the style from the elapsed interval', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);
    slideshow.kenBurns.value = true;
    const now = vi.spyOn(performance, 'now').mockReturnValue(1500);

    slideshow.startSlideshow();
    state.rafCb!();

    expect(deps.kenStyle.scale).toBeCloseTo(1.075);
    expect(deps.kenStyle.translateX).toBeCloseTo(1);
    expect(deps.kenStyle.translateY).toBeCloseTo(0.5);
    now.mockRestore();
  });

  it('pauses the loop when Ken Burns or the slideshow is off', () => {
    const deps = makeDeps();
    const slideshow = useImageViewerSlideshow(deps);

    state.rafCb!();
    expect(state.pauseKen).toHaveBeenCalled();
    state.pauseKen.mockClear();

    slideshow.kenBurns.value = true;
    slideshow.slideshowActive.value = false;
    state.rafCb!();
    expect(state.pauseKen).toHaveBeenCalled();
  });
});
