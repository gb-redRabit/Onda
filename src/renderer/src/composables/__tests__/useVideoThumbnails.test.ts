import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

// Composable miniatur: mockujemy wyliczenia z `videoClipper` i API preloadu,
// a testujemy tokeny anulowania, debounce i stan paska klatek.
const state = vi.hoisted(() => ({
  desired: vi.fn((_width?: number, _zoom?: number) => 5),
  computeWindow: vi.fn((_input?: unknown): unknown => null),
  clipThumbnails: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@renderer/utils/videoClipper', () => ({
  desiredThumbnailCount: (width: number, zoom: number) => state.desired(width, zoom),
  computeFrameStripWindow: (input: unknown) => state.computeWindow(input)
}));

const { useVideoThumbnails } = await import('../useVideoThumbnails');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let frameStripActive = false;

function setup(overrides: { videoPath?: string; duration?: number; width?: number } = {}) {
  frameStripActive = false;
  const videoPath = ref(overrides.videoPath ?? '/video.mp4');
  const duration = ref(overrides.duration ?? 120);
  const videoFps = ref(25);
  const timelineZoom = ref(2);
  const timelineScrollEl = ref<HTMLElement | null>({
    clientWidth: 800,
    scrollLeft: 0
  } as unknown as HTMLElement);
  const timelineEl = ref<HTMLElement | null>({ clientWidth: 1600 } as unknown as HTMLElement);
  const thumbs = useVideoThumbnails({
    videoPath,
    duration,
    videoFps,
    timelineZoom,
    timelineScrollEl,
    timelineEl,
    frameStripActive: () => frameStripActive
  });
  return { ...thumbs, videoPath, duration, videoFps, timelineZoom, timelineScrollEl, timelineEl };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.desired.mockReset();
  state.desired.mockReturnValue(5);
  state.computeWindow.mockReset();
  state.computeWindow.mockReturnValue(null);
  state.clipThumbnails.mockReset();
  state.clipThumbnails.mockResolvedValue({ success: true, frames: [] });
  (window as { api?: unknown }).api = { clipThumbnails: state.clipThumbnails };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { api?: unknown }).api;
});

describe('thumbnail count', () => {
  it('uses the timeline viewport width and zoom', () => {
    const thumbs = setup();
    expect(thumbs.currentThumbnailCount()).toBe(5);
    expect(state.desired).toHaveBeenCalledWith(800, 2);

    thumbs.timelineScrollEl.value = null;
    expect(thumbs.currentThumbnailCount()).toBe(5);
    expect(state.desired).toHaveBeenLastCalledWith(0, 2);
  });
});

describe('generateThumbnails', () => {
  it('does nothing without a path or duration', async () => {
    const noPath = setup({ videoPath: '' });
    await noPath.generateThumbnails();
    expect(state.clipThumbnails).not.toHaveBeenCalled();

    const noDuration = setup({ duration: 0 });
    await noDuration.generateThumbnails();
    expect(state.clipThumbnails).not.toHaveBeenCalled();
    expect(noDuration.thumbsLoading.value).toBe(false);
  });

  it('stores frames and the reported fps', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({
      success: true,
      frames: ['a', 'b'],
      fps: 30
    });

    await thumbs.generateThumbnails();

    expect(state.clipThumbnails).toHaveBeenCalledWith({ inputPath: '/video.mp4', count: 5 });
    expect(thumbs.thumbnails.value).toEqual(['a', 'b']);
    expect(thumbs.videoFps.value).toBe(30);
    expect(thumbs.thumbsLoading.value).toBe(false);
    expect(thumbs.thumbsError.value).toBe('');
  });

  it('keeps the fps when the response has none', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['a'], fps: 0 });
    await thumbs.generateThumbnails();
    expect(thumbs.videoFps.value).toBe(25);
  });

  it('reports an API failure when there are no frames yet', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({ success: false, error: 'ffmpeg failed' });

    await thumbs.generateThumbnails();

    expect(thumbs.thumbsError.value).toBe('ffmpeg failed');
    expect(thumbs.thumbsLoading.value).toBe(false);
  });

  it('uses a localized message when the API gives no error', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({ success: false });

    await thumbs.generateThumbnails();

    expect(thumbs.thumbsError.value).toBe('tools.clipThumbnailsUnavailable');
  });

  it('clears old thumbnails and reports a later failure', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValueOnce({ success: true, frames: ['a'] });
    await thumbs.generateThumbnails();

    state.clipThumbnails.mockResolvedValueOnce({ success: false, error: 'later' });
    await thumbs.generateThumbnails();

    expect(thumbs.thumbnails.value).toEqual([]);
    expect(thumbs.thumbsError.value).toBe('later');
  });

  it('captures thrown errors', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockRejectedValue(new Error('boom'));

    await thumbs.generateThumbnails();

    expect(thumbs.thumbsError.value).toBe('boom');
    expect(thumbs.thumbsLoading.value).toBe(false);
  });

  it('sets refreshing while the request is in flight', async () => {
    const thumbs = setup();
    const request = deferred<{ success: boolean; frames: string[] }>();
    state.clipThumbnails.mockReturnValue(request.promise);

    const pending = thumbs.generateThumbnails();
    expect(thumbs.thumbsLoading.value).toBe(true);
    expect(thumbs.thumbsRefreshing.value).toBe(true);

    request.resolve({ success: true, frames: ['a'] });
    await pending;
    expect(thumbs.thumbsRefreshing.value).toBe(false);
  });

  it('ignores a response after cancellation', async () => {
    const thumbs = setup();
    const request = deferred<{ success: boolean; frames: string[] }>();
    state.clipThumbnails.mockReturnValue(request.promise);

    const pending = thumbs.generateThumbnails();
    thumbs.cancelThumbnails();
    request.resolve({ success: true, frames: ['late'] });
    await pending;

    expect(thumbs.thumbnails.value).toEqual([]);
    expect(thumbs.thumbsLoading.value).toBe(false);
  });
});

describe('scheduled refresh', () => {
  it('skips without a path, a duration or when the frame strip is active', () => {
    const thumbs = setup({ videoPath: '' });
    thumbs.scheduleThumbnailRefresh();
    vi.advanceTimersByTime(300);
    expect(state.clipThumbnails).not.toHaveBeenCalled();
  });

  it('debounces repeated calls into one request', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['a'] });

    thumbs.scheduleThumbnailRefresh();
    thumbs.scheduleThumbnailRefresh();
    expect(state.clipThumbnails).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(220);
    expect(state.clipThumbnails).toHaveBeenCalledTimes(1);
  });

  it('skips when the count is unchanged and thumbnails already exist', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['a'] });
    await thumbs.generateThumbnails();

    thumbs.scheduleThumbnailRefresh();
    await vi.advanceTimersByTimeAsync(220);

    expect(state.clipThumbnails).toHaveBeenCalledTimes(1);
  });

  it('requests again when the zoom changes the desired count', async () => {
    const thumbs = setup();
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['a'] });
    await thumbs.generateThumbnails();

    state.desired.mockReturnValue(9);
    thumbs.scheduleThumbnailRefresh();
    await vi.advanceTimersByTimeAsync(220);

    expect(state.clipThumbnails).toHaveBeenCalledTimes(2);
    expect(state.clipThumbnails).toHaveBeenLastCalledWith({ inputPath: '/video.mp4', count: 9 });
  });

  it('honours a custom delay and cancellation', async () => {
    const thumbs = setup();
    thumbs.scheduleThumbnailRefresh(50);
    thumbs.cancelThumbnails();
    await vi.advanceTimersByTimeAsync(100);
    expect(state.clipThumbnails).not.toHaveBeenCalled();
  });
});

describe('frame strip', () => {
  const windowInfo = { start: 10, end: 20, stepSec: 0.04, count: 5 };

  function enableStrip(thumbs: ReturnType<typeof setup>): void {
    frameStripActive = true;
    thumbs.videoPath.value = '/video.mp4';
    thumbs.duration.value = 120;
    state.computeWindow.mockReturnValue(windowInfo);
  }

  it('skips scheduling without a path or when inactive', () => {
    const thumbs = setup();
    thumbs.scheduleFrameStrip();
    vi.advanceTimersByTime(300);
    expect(state.clipThumbnails).not.toHaveBeenCalled();
  });

  it('does not request without timeline elements', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    thumbs.timelineEl.value = null;

    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(state.clipThumbnails).not.toHaveBeenCalled();
  });

  it('does not request when the window cannot be computed', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.computeWindow.mockReturnValue(null);

    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(state.clipThumbnails).not.toHaveBeenCalled();
  });

  it('stores frames with fallback start and step', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['f1', 'f2'] });

    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(state.clipThumbnails).toHaveBeenCalledWith({
      inputPath: '/video.mp4',
      count: 5,
      startSec: 10,
      endSec: 20
    });
    expect(thumbs.frameStrip.value).toEqual({
      startSec: 10,
      stepSec: 0.04,
      frames: ['f1', 'f2']
    });
    expect(thumbs.frameStripLoading.value).toBe(false);
  });

  it('prefers start and step reported by the API', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.clipThumbnails.mockResolvedValue({
      success: true,
      frames: ['f1'],
      startSec: 11,
      stepSec: 0.05
    });

    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(thumbs.frameStrip.value).toMatchObject({ startSec: 11, stepSec: 0.05 });
  });

  it('does not request the same window twice', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['f1'] });

    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);
    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(state.clipThumbnails).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous strip on failure and clears loading', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.clipThumbnails.mockResolvedValueOnce({ success: true, frames: ['f1'] });
    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    state.computeWindow.mockReturnValue({ ...windowInfo, start: 30 });
    state.clipThumbnails.mockRejectedValueOnce(new Error('ffmpeg'));
    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(thumbs.frameStrip.value?.frames).toEqual(['f1']);
    expect(thumbs.frameStripLoading.value).toBe(false);
  });

  it('ignores a response after cancelFrameStrip', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    const request = deferred<{ success: boolean; frames: string[] }>();
    state.clipThumbnails.mockReturnValue(request.promise);

    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);
    thumbs.cancelFrameStrip();
    request.resolve({ success: true, frames: ['late'] });
    await Promise.resolve();

    expect(thumbs.frameStrip.value).toBeNull();
    expect(thumbs.frameStripLoading.value).toBe(false);
  });

  it('clears frames and pending timers on cancel', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['f1'] });
    thumbs.scheduleFrameStrip();
    await vi.advanceTimersByTimeAsync(180);
    expect(thumbs.frameStrip.value).not.toBeNull();

    thumbs.scheduleFrameStrip();
    thumbs.cancelFrameStrip();
    await vi.advanceTimersByTimeAsync(180);

    expect(thumbs.frameStrip.value).toBeNull();
    expect(state.clipThumbnails).toHaveBeenCalledTimes(1);
  });

  it('schedules a frame strip after thumbnails load when active', async () => {
    const thumbs = setup();
    enableStrip(thumbs);
    state.clipThumbnails.mockResolvedValue({ success: true, frames: ['thumb'] });

    await thumbs.generateThumbnails();
    await vi.advanceTimersByTimeAsync(180);

    expect(state.clipThumbnails).toHaveBeenCalledTimes(2);
  });
});
