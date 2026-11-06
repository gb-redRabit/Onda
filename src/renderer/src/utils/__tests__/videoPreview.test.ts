import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ref } from 'vue';
import { formatDuration } from '@renderer/utils/formatters';

const { createVideoPreviewCore } = await import('../videoPreview');

function fakeVideo(overrides: Partial<Record<string, unknown>> = {}) {
  const video = {
    readyState: 2,
    duration: 100,
    currentSrc: 'https://cdn/video.mp4',
    src: 'https://cdn/video.mp4',
    currentTime: 0,
    muted: false,
    playsInline: false,
    preload: '',
    crossOrigin: '',
    load: vi.fn(),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides
  };
  return video;
}

function fakeBar(width = 200, left = 100): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left,
      width,
      top: 0,
      height: 10,
      right: left + width,
      bottom: 10
    })
  } as unknown as HTMLElement;
}

let ctx: { drawImage: ReturnType<typeof vi.fn> };
let toDataUrl: Mock<(quality?: number) => string>;

beforeEach(() => {
  vi.useFakeTimers();
  ctx = { drawImage: vi.fn() };
  toDataUrl = vi.fn(() => 'data:image/jpeg;base64,frame');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    (_type?: string, quality?: number) => toDataUrl(quality)
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(duration = 100) {
  const videoRef = ref(fakeVideo({ duration }) as unknown as HTMLVideoElement);
  const progressRef = ref<HTMLElement | null>(fakeBar());
  const core = createVideoPreviewCore({
    width: 320,
    height: 180,
    quality: 0.7,
    seekDebounceMs: 40,
    videoRef,
    progressRef
  });
  const hidden = fakeVideo();
  core.setHiddenVideoRef(hidden);
  return { core, hidden, videoRef, progressRef };
}

describe('setup and teardown', () => {
  it('configures the hidden video and registers frame listeners', () => {
    const { core, hidden } = setup();

    core.setup();

    expect(hidden.muted).toBe(true);
    expect(hidden.playsInline).toBe(true);
    expect(hidden.preload).toBe('auto');
    expect(hidden.crossOrigin).toBe('anonymous');
    expect(hidden.addEventListener).toHaveBeenCalledWith('seeked', expect.any(Function));
    expect(hidden.addEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
  });

  it('does nothing without a hidden video', () => {
    const videoRef = ref(fakeVideo() as unknown as HTMLVideoElement);
    const progressRef = ref<HTMLElement | null>(fakeBar());
    const core = createVideoPreviewCore({
      width: 320,
      height: 180,
      quality: 0.7,
      seekDebounceMs: 40,
      videoRef,
      progressRef
    });

    expect(() => core.setup()).not.toThrow();
    expect(() => core.teardown()).not.toThrow();
  });

  it('detaches listeners, pauses and clears the source', () => {
    const { core, hidden } = setup();
    core.setup();

    core.teardown();

    expect(hidden.removeEventListener).toHaveBeenCalledWith('seeked', expect.any(Function));
    expect(hidden.removeEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
    expect(hidden.pause).toHaveBeenCalled();
    expect(hidden.removeAttribute).toHaveBeenCalledWith('src');
    expect(hidden.load).toHaveBeenCalled();
  });

  it('cancels a pending seek on teardown', () => {
    const { core, hidden } = setup();
    core.handleMouseMove({ clientX: 150 } as MouseEvent);

    core.teardown();
    vi.advanceTimersByTime(100);

    expect(hidden.currentTime).toBe(0);
  });
});

describe('drawFrame', () => {
  it('draws the hidden video into the configured canvas', () => {
    const { core, hidden } = setup();

    core.drawFrame();

    expect(ctx.drawImage).toHaveBeenCalledWith(hidden, 0, 0, 320, 180);
    expect(toDataUrl).toHaveBeenCalledWith(0.7);
    expect(core.previewDataUrl.value).toBe('data:image/jpeg;base64,frame');
  });

  it('skips drawing until enough data is available', () => {
    const { core, hidden } = setup();
    hidden.readyState = 1;

    core.drawFrame();

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(core.previewDataUrl.value).toBeNull();
  });

  it('skips drawing without a hidden video', () => {
    const videoRef = ref(fakeVideo() as unknown as HTMLVideoElement);
    const progressRef = ref<HTMLElement | null>(fakeBar());
    const core = createVideoPreviewCore({
      width: 10,
      height: 10,
      quality: 1,
      seekDebounceMs: 0,
      videoRef,
      progressRef
    });

    core.drawFrame();
    expect(toDataUrl).not.toHaveBeenCalled();
  });

  it('clears the preview when the canvas has no 2d context', () => {
    const { core } = setup();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    core.drawFrame();
    expect(core.previewDataUrl.value).toBeNull();
  });

  it('clears the preview when exporting the frame throws', () => {
    const { core } = setup();
    toDataUrl.mockImplementation(() => {
      throw new Error('tainted');
    });

    core.drawFrame();
    expect(core.previewDataUrl.value).toBeNull();
  });
});

describe('seekTo', () => {
  it('copies the source once and loads the hidden video', () => {
    const { core, hidden } = setup();

    core.handleMouseMove({ clientX: 150 } as MouseEvent);
    vi.advanceTimersByTime(40);
    expect(hidden.src).toBe('https://cdn/video.mp4');
    expect(hidden.load).toHaveBeenCalledTimes(1);
    expect(core.previewDataUrl.value).toBeNull();

    core.handleMouseMove({ clientX: 160 } as MouseEvent);
    vi.advanceTimersByTime(40);
    expect(hidden.load).toHaveBeenCalledTimes(1);
  });

  it('clamps the seek position to the video duration', () => {
    const { core, hidden } = setup(50);

    core.handleMouseMove({ clientX: 400 } as MouseEvent);
    vi.advanceTimersByTime(40);
    expect(hidden.currentTime).toBe(50);

    core.handleMouseMove({ clientX: 0 } as MouseEvent);
    vi.advanceTimersByTime(40);
    expect(hidden.currentTime).toBe(0);
  });

  it('ignores non-finite times', () => {
    const { core, hidden } = setup();
    const previous = hidden.currentTime;

    core.handleMouseMove({ clientX: 150 } as MouseEvent);
    // Ręczne wywołanie przez timer z wartością NaN nie jest dostępne publicznie,
    // więc sprawdzamy, że niekończony czas nie zmienia pozycji.
    core.handleMouseMove({ clientX: Number.NaN } as MouseEvent);
    vi.advanceTimersByTime(40);

    expect(hidden.currentTime).toBe(previous);
  });
});

describe('mouse handling', () => {
  it('computes percentage, clamps the left offset and debounces the seek', () => {
    const { core, hidden } = setup(100);

    core.handleMouseMove({ clientX: 250 } as MouseEvent);
    expect(core.previewVisible.value).toBe(true);
    expect(core.previewTime.value).toBe(75);
    expect(core.previewLeft.value).toBe(75);
    expect(hidden.currentTime).toBe(0);

    vi.advanceTimersByTime(39);
    expect(hidden.currentTime).toBe(0);
    vi.advanceTimersByTime(1);
    expect(hidden.currentTime).toBe(75);
  });

  it('clamps a pointer outside the bar', () => {
    const { core } = setup();
    core.handleMouseMove({ clientX: 0 } as MouseEvent);
    expect(core.previewTime.value).toBe(0);
    expect(core.previewLeft.value).toBe(0);

    core.handleMouseMove({ clientX: 999 } as MouseEvent);
    expect(core.previewLeft.value).toBe(100);
    expect(core.previewTime.value).toBe(100);
  });

  it('ignores a move without a bar, video or duration', () => {
    const videoRef = ref(fakeVideo({ duration: Number.NaN }) as unknown as HTMLVideoElement);
    const progressRef = ref<HTMLElement | null>(fakeBar());
    const core = createVideoPreviewCore({
      width: 10,
      height: 10,
      quality: 1,
      seekDebounceMs: 10,
      videoRef,
      progressRef
    });

    core.handleMouseMove({ clientX: 150 } as MouseEvent);
    expect(core.previewVisible.value).toBe(false);

    videoRef.value = fakeVideo() as unknown as HTMLVideoElement;
    progressRef.value = null;
    core.handleMouseMove({ clientX: 150 } as MouseEvent);
    expect(core.previewVisible.value).toBe(false);
  });

  it('hides the preview and cancels the pending seek on leave', () => {
    const { core, hidden } = setup();

    core.handleMouseMove({ clientX: 150 } as MouseEvent);
    core.handleMouseLeave();
    vi.advanceTimersByTime(100);

    expect(core.previewVisible.value).toBe(false);
    expect(hidden.currentTime).toBe(0);
  });

  it('reuses one hidden video and renders a formatted time label', () => {
    const { core } = setup(120);

    core.handleMouseMove({ clientX: 150 } as MouseEvent);

    expect(core.previewTimeLabel()).toBe(formatDuration(core.previewTime.value));
    expect(core.hiddenVideoRef.value).not.toBeNull();
  });
});
