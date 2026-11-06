import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { FileItem } from '@renderer/types/explorer';

// Podgląd obrazu: URL-e i timer wysokiej rozdzielczości są podstawione,
// a `Image` przechwytuje preload i onload.
const state = vi.hoisted(() => ({
  loadScaled: vi.fn(),
  timerCallback: null as null | (() => void),
  start: vi.fn(),
  stop: vi.fn(),
  images: [] as Array<{ src: string; onload: (() => void) | null }>
}));

vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`,
  loadScaledImageUrl: (path: string, width: number) => state.loadScaled(path, width)
}));
vi.mock('../useTimers', () => ({
  useTimeoutFn: (callback: () => void) => {
    state.timerCallback = callback;
    return { start: state.start, stop: state.stop };
  }
}));

const { useImageViewerImage } = await import('../useImageViewerImage');

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  constructor() {
    state.images.push(this);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const files = [{ path: '/a.jpg' }, { path: '/b.jpg' }, { path: '/c.jpg' }] as FileItem[];

let scopes: Array<{ stop: () => void }> = [];
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

function setup(index = 0) {
  const scope = effectScope();
  let api!: ReturnType<typeof useImageViewerImage>;
  const filesRef = ref(files);
  const currentIndex = ref(index);
  scope.run(() => {
    api = useImageViewerImage({ files: filesRef, currentIndex });
  });
  scopes.push(scope);
  return { ...api, filesRef, currentIndex };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Image', FakeImage);
  state.loadScaled.mockReset();
  state.loadScaled.mockResolvedValue('blob:scaled');
  state.timerCallback = null;
  state.start.mockClear();
  state.stop.mockClear();
  state.images = [];
  scopes = [];
  let counter = 0;
  createObjectURL = vi.fn(() => `blob:${++counter}`);
  revokeObjectURL = vi.fn();
  (URL as unknown as Record<string, unknown>).createObjectURL = createObjectURL;
  (URL as unknown as Record<string, unknown>).revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  for (const scope of scopes) scope.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('initial load and preload', () => {
  it('loads the current file and preloads the next one', async () => {
    const image = setup(0);

    image.loadInitial();
    expect(state.loadScaled).toHaveBeenCalledWith('/a.jpg', 1920);
    await vi.advanceTimersByTimeAsync(0);
    expect(image.displaySrc.value).toBe('blob:scaled');

    expect(state.images).toHaveLength(1);
    expect(state.images[0].src).toBe('media:///b.jpg');
  });

  it('does nothing when there is no current file', async () => {
    const image = setup(0);
    image.filesRef.value = [];
    image.loadInitial();

    expect(state.loadScaled).not.toHaveBeenCalled();
    expect(state.images).toHaveLength(0);
  });

  it('falls back to the media server URL when scaling fails', async () => {
    const image = setup();
    state.loadScaled.mockRejectedValue(new Error('decode'));

    image.loadInitial();
    await vi.advanceTimersByTimeAsync(0);

    expect(image.displaySrc.value).toBe('media:///a.jpg');
  });

  it('does not preload past the end', () => {
    const image = setup(2);
    image.preloadNext();
    expect(state.images).toHaveLength(0);
  });
});

describe('loadAt and stale responses', () => {
  it('switches the index and shows the scaled image', async () => {
    const image = setup(0);

    image.loadAt(2);
    expect(image.currentIndex.value).toBe(2);
    expect(image.usingHighRes.value).toBe(false);
    await vi.advanceTimersByTimeAsync(0);

    expect(state.loadScaled).toHaveBeenCalledWith('/c.jpg', 1920);
    expect(image.displaySrc.value).toBe('blob:scaled');
  });

  it('revokes a late response from an older epoch', async () => {
    const image = setup(0);
    const first = deferred<string>();
    const second = deferred<string>();
    state.loadScaled.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    image.loadAt(1);
    image.loadAt(2);

    second.resolve('blob:new');
    await vi.advanceTimersByTimeAsync(0);
    expect(image.displaySrc.value).toBe('blob:new');

    first.resolve('blob:old');
    await vi.advanceTimersByTimeAsync(0);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:old');
    expect(image.displaySrc.value).toBe('blob:new');
  });

  it('revokes the previous object URL after a short delay', async () => {
    const image = setup(0);
    state.loadScaled.mockResolvedValueOnce('blob:first').mockResolvedValueOnce('blob:second');

    image.loadAt(0);
    await vi.advanceTimersByTimeAsync(0);
    image.loadAt(1);
    await vi.advanceTimersByTimeAsync(0);

    expect(image.displaySrc.value).toBe('blob:second');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
  });
});

describe('high resolution scheduling', () => {
  it('starts a delayed high-res load when zoomed in', () => {
    const image = setup(0);
    image.scale.value = 2;

    image.scheduleHighRes();

    expect(state.stop).toHaveBeenCalled();
    expect(state.start).toHaveBeenCalled();
    expect(state.images).toHaveLength(0);

    state.timerCallback!();
    expect(state.images).toHaveLength(1);
    expect(state.images[0].src).toBe('media:///a.jpg');
    state.images[0].onload!();

    expect(image.displaySrc.value).toBe('media:///a.jpg');
    expect(image.usingHighRes.value).toBe(true);
  });

  it('drops back to the scaled image when zoom is low', async () => {
    const image = setup(0);
    image.usingHighRes.value = true;
    image.scale.value = 1;
    state.loadScaled.mockResolvedValue('blob:low');

    image.scheduleHighRes();
    await vi.advanceTimersByTimeAsync(0);

    expect(state.start).not.toHaveBeenCalled();
    expect(image.usingHighRes.value).toBe(false);
    expect(image.displaySrc.value).toBe('blob:low');
  });

  it('does nothing at low zoom when already using the scaled image', () => {
    const image = setup(0);
    image.scale.value = 1;

    image.scheduleHighRes();

    expect(state.stop).toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
    expect(state.loadScaled).not.toHaveBeenCalled();
  });

  it('does nothing without a current file', () => {
    const image = setup(0);
    image.filesRef.value = [];
    image.scale.value = 2;

    image.scheduleHighRes();

    expect(state.start).not.toHaveBeenCalled();
  });
});

describe('zoom and transforms', () => {
  it('zooms in with a 5x cap', () => {
    const image = setup();
    image.zoomIn();
    expect(image.scale.value).toBeCloseTo(1.3);
    expect(state.start).not.toHaveBeenCalled();

    image.scale.value = 4.9;
    image.zoomIn();
    expect(image.scale.value).toBe(5);
    expect(state.start).toHaveBeenCalled();
  });

  it('zooms out with a 0.2 floor', () => {
    const image = setup();
    image.zoomOut();
    expect(image.scale.value).toBeCloseTo(1 / 1.3);

    image.scale.value = 0.2;
    image.zoomOut();
    expect(image.scale.value).toBe(0.2);
  });

  it('switches back to the scaled image when zooming out below the threshold', async () => {
    const image = setup();
    image.usingHighRes.value = true;
    image.scale.value = 1.6;
    state.loadScaled.mockResolvedValue('blob:zoomed-out');

    image.zoomOut();
    await vi.advanceTimersByTimeAsync(0);

    expect(image.usingHighRes.value).toBe(false);
    expect(image.displaySrc.value).toBe('blob:zoomed-out');
  });

  it('resets scale, rotation and ken burns offsets', () => {
    const image = setup();
    image.scale.value = 3;
    image.rotation.value = 90;
    image.kenStyle.scale = 1.2;
    image.kenStyle.translateX = 10;
    image.kenStyle.translateY = -5;

    image.fitToScreen();

    expect(image.scale.value).toBe(1);
    expect(image.rotation.value).toBe(0);
    expect(image.kenStyle).toEqual({ scale: 1, translateX: 0, translateY: 0 });
    expect(state.stop).toHaveBeenCalled();
  });

  it('rotates in 90-degree steps', () => {
    const image = setup();
    image.rotate();
    expect(image.rotation.value).toBe(90);
    image.rotate();
    expect(image.rotation.value).toBe(180);
    image.rotate();
    expect(image.rotation.value).toBe(270);
    image.rotate();
    expect(image.rotation.value).toBe(0);
  });

  it('composes the CSS transform from scale, rotation and offsets', () => {
    const image = setup();
    image.scale.value = 2;
    image.rotation.value = 90;
    image.kenStyle.scale = 1.5;
    image.kenStyle.translateX = 4;
    image.kenStyle.translateY = -3;

    expect(image.makeTransform('translateZ(0)')).toBe(
      'translateZ(0) scale3d(3,3,1) rotate(90deg) translateX(4px) translateY(-3px)'
    );
  });
});

describe('scope disposal', () => {
  it('revokes the object URL and stops the timer', async () => {
    const image = setup(0);
    state.loadScaled.mockResolvedValue('blob:current');
    image.loadInitial();
    await vi.advanceTimersByTimeAsync(0);

    for (const scope of scopes) scope.stop();
    scopes = [];

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:current');
    expect(state.stop).toHaveBeenCalled();
  });

  it('revokes a response that arrives after disposal', async () => {
    const image = setup(0);
    const pending = deferred<string>();
    state.loadScaled.mockReturnValue(pending.promise);
    image.loadInitial();

    for (const scope of scopes) scope.stop();
    scopes = [];

    pending.resolve('blob:late');
    await vi.advanceTimersByTimeAsync(0);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:late');
    expect(image.displaySrc.value).toBe('');
  });
});
