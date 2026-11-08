import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type Ref } from 'vue';
import { useImageViewerTransition } from '../useImageViewerTransition';
import type { FileItem } from '@renderer/types/explorer';

const REST = { opacity: 1, transform: 'translateX(0) scale3d(1,1,1)', filter: 'blur(0px)' };

function file(name: string): FileItem {
  return {
    name,
    path: `C:/pics/${name}`,
    isDirectory: false,
    size: 1,
    modifiedAt: 0,
    createdAt: 0
  };
}

interface Harness {
  transition: ReturnType<typeof useImageViewerTransition>;
  files: Ref<FileItem[]>;
  currentIndex: Ref<number>;
  displaySrc: Ref<string>;
  loadAt: ReturnType<typeof vi.fn>;
  preloadNext: ReturnType<typeof vi.fn>;
  unmount: () => void;
}

function mountTransition(): Harness {
  const files = ref<FileItem[]>([file('a.jpg'), file('b.jpg'), file('c.jpg')]);
  const currentIndex = ref(0);
  const displaySrc = ref('a.jpg');
  const loadAt = vi.fn();
  const preloadNext = vi.fn();
  let transition: ReturnType<typeof useImageViewerTransition> | null = null;

  const app = createApp({
    setup() {
      transition = useImageViewerTransition({
        files,
        currentIndex,
        displaySrc,
        loadAt,
        preloadNext
      });
      return () => h('div');
    }
  });
  app.mount(document.createElement('div'));

  return {
    transition: transition as unknown as ReturnType<typeof useImageViewerTransition>,
    files,
    currentIndex,
    displaySrc,
    loadAt,
    preloadNext,
    unmount: () => app.unmount()
  };
}

let harness: Harness | null = null;

function mount() {
  harness = mountTransition();
  return harness;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  harness?.unmount();
  harness = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initial state', () => {
  it('starts at rest with the default fade transition', () => {
    const { transition, unmount } = mount();

    expect(transition.oldSrc.value).toBe('');
    expect(transition.imgError.value).toBe(false);
    expect(transition.transitionType.value).toBe('fade');
    expect(transition.activeTransition.value).toBe('fade');
    expect(transition.transitionDuration.value).toBe(500);
    expect(transition.direction.value).toBe('next');
    expect(transition.transitioning.value).toBe(false);
    expect(transition.newStyle).toEqual(REST);
    expect(transition.oldStyle).toEqual({ ...REST, opacity: 0 });
    unmount();
  });
});

describe('navigateTo', () => {
  it('moves forward and prepares the incoming image', () => {
    const { transition, currentIndex, loadAt, preloadNext, unmount } = mount();

    transition.navigateTo(1, 'next');

    expect(currentIndex.value).toBe(1);
    expect(transition.oldSrc.value).toBe('a.jpg');
    expect(transition.transitioning.value).toBe(true);
    expect(transition.direction.value).toBe('next');
    expect(transition.imgError.value).toBe(false);
    expect(transition.newStyle).toEqual({
      opacity: 0,
      transform: 'translateX(0) scale3d(1,1,1)',
      filter: 'blur(0px)'
    });
    expect(loadAt).toHaveBeenCalledWith(1);
    expect(preloadNext).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('uses the configured transition in the requested direction', () => {
    const { transition, unmount } = mount();
    transition.transitionType.value = 'slide';

    transition.navigateTo(1, 'next');
    expect(transition.activeTransition.value).toBe('slide');
    expect(transition.newStyle.transform).toBe('translateX(15%) scale3d(0.95,0.95,1)');

    transition.endTransition();
    transition.transitionType.value = 'slide';
    transition.navigateTo(0, 'prev');
    expect(transition.newStyle.transform).toBe('translateX(-15%) scale3d(0.95,0.95,1)');
    unmount();
  });

  it('picks a concrete transition when random is selected', () => {
    const { transition, unmount } = mount();
    transition.transitionType.value = 'random';

    vi.spyOn(Math, 'random').mockReturnValue(0);
    transition.navigateTo(1, 'next');
    expect(transition.activeTransition.value).toBe('fade');

    transition.endTransition();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    transition.navigateTo(2, 'next');
    expect(transition.activeTransition.value).toBe('zoomOut');
    unmount();
  });

  it('does nothing while a transition is running', () => {
    const { transition, currentIndex, loadAt, unmount } = mount();
    transition.navigateTo(1, 'next');
    loadAt.mockClear();

    transition.navigateTo(2, 'next');

    expect(currentIndex.value).toBe(1);
    expect(loadAt).not.toHaveBeenCalled();
    unmount();
  });

  it('ignores a navigation to the current index', () => {
    const { transition, currentIndex, loadAt, unmount } = mount();

    transition.navigateTo(0, 'next');

    expect(transition.transitioning.value).toBe(false);
    expect(transition.oldSrc.value).toBe('');
    expect(currentIndex.value).toBe(0);
    expect(loadAt).not.toHaveBeenCalled();
    unmount();
  });

  it('leaves oldSrc empty without a displayed source', () => {
    const { transition, displaySrc, unmount } = mount();
    displaySrc.value = '';

    transition.navigateTo(1, 'next');

    expect(transition.oldSrc.value).toBe('');
    unmount();
  });

  it('recovers when the target file is missing', () => {
    const { transition, files, currentIndex, loadAt, preloadNext, unmount } = mount();
    files.value = [file('a.jpg')];

    transition.navigateTo(3, 'next');

    expect(currentIndex.value).toBe(3);
    expect(transition.transitioning.value).toBe(false);
    expect(loadAt).not.toHaveBeenCalled();
    expect(preloadNext).not.toHaveBeenCalled();
    unmount();
  });
});

describe('next and prev', () => {
  it('advances while a next item exists', () => {
    const { transition, currentIndex, unmount } = mount();

    transition.next(ref(true));

    expect(currentIndex.value).toBe(1);
    unmount();
  });

  it('wraps to the first item from the end', () => {
    const { transition, currentIndex, unmount } = mount();
    currentIndex.value = 2;

    transition.next(ref(true));

    expect(currentIndex.value).toBe(0);
    unmount();
  });

  it('ignores next when none is available', () => {
    const { transition, currentIndex, unmount } = mount();

    transition.next(ref(false));

    expect(currentIndex.value).toBe(0);
    expect(transition.transitioning.value).toBe(false);
    unmount();
  });

  it('goes back and wraps to the last item', () => {
    const { transition, currentIndex, unmount } = mount();

    transition.prev(ref(true));
    expect(currentIndex.value).toBe(2);

    transition.endTransition();
    transition.prev(ref(true));
    expect(currentIndex.value).toBe(1);
    unmount();
  });

  it('ignores prev when none is available', () => {
    const { transition, currentIndex, unmount } = mount();

    transition.prev(ref(false));

    expect(currentIndex.value).toBe(0);
    expect(transition.transitioning.value).toBe(false);
    unmount();
  });
});

describe('goTo', () => {
  it('derives the direction from the index delta', () => {
    const { transition, currentIndex, unmount } = mount();

    transition.goTo(2);
    expect(currentIndex.value).toBe(2);
    expect(transition.direction.value).toBe('next');

    transition.endTransition();
    transition.goTo(0);
    expect(currentIndex.value).toBe(0);
    expect(transition.direction.value).toBe('prev');
    unmount();
  });

  it('ignores the current index', () => {
    const { transition, loadAt, unmount } = mount();

    transition.goTo(0);

    expect(transition.transitioning.value).toBe(false);
    expect(loadAt).not.toHaveBeenCalled();
    unmount();
  });
});

describe('image lifecycle', () => {
  it('moves the new image to rest and starts the exit animation', async () => {
    const { transition, unmount } = mount();
    transition.transitionType.value = 'slide';
    transition.navigateTo(1, 'next');

    transition.onImageLoaded();
    await nextTick();

    expect(transition.newStyle).toEqual(REST);
    expect(transition.oldStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-15%) scale3d(0.95,0.95,1)',
      filter: 'blur(4px)'
    });

    vi.advanceTimersByTime(500);
    expect(transition.oldStyle).toEqual(REST);
    expect(transition.oldSrc.value).toBe('');
    expect(transition.transitioning.value).toBe(false);
    unmount();
  });

  it('ignores load events outside a transition', async () => {
    const { transition, unmount } = mount();
    transition.newStyle.opacity = 0.5;

    transition.onImageLoaded();
    await nextTick();

    expect(transition.newStyle.opacity).toBe(0.5);
    expect(transition.oldStyle.opacity).toBe(0);
    unmount();
  });

  it('can stop the exit animation', async () => {
    const { transition, unmount } = mount();
    transition.navigateTo(1, 'next');
    transition.onImageLoaded();
    await nextTick();

    transition.stopTransition();
    vi.advanceTimersByTime(1000);

    expect(transition.oldSrc.value).toBe('a.jpg');
    expect(transition.transitioning.value).toBe(true);
    expect(transition.oldStyle.opacity).toBe(0);
    unmount();
  });

  it('reports an image error and ends the transition immediately', () => {
    const { transition, unmount } = mount();
    transition.navigateTo(1, 'next');

    transition.onImageError();

    expect(transition.imgError.value).toBe(true);
    expect(transition.transitioning.value).toBe(false);
    expect(transition.oldSrc.value).toBe('');
    expect(transition.oldStyle).toEqual(REST);
    unmount();
  });

  it('ignores errors outside a transition', () => {
    const { transition, unmount } = mount();

    transition.onImageError();

    expect(transition.imgError.value).toBe(false);
    unmount();
  });

  it('resets only the outgoing layer when ended manually', () => {
    const { transition, unmount } = mount();
    transition.navigateTo(1, 'next');
    transition.newStyle.opacity = 0;
    transition.oldStyle.opacity = 0.2;

    transition.endTransition();

    // The incoming layer keeps whatever its own load callback set; the outgoing one
    // is restored so the next navigation starts from a clean slate.
    expect(transition.newStyle.opacity).toBe(0);
    expect(transition.oldStyle).toEqual(REST);
    expect(transition.oldSrc.value).toBe('');
    expect(transition.transitioning.value).toBe(false);
    unmount();
  });
});
