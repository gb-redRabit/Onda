import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  toMediaUrl: vi.fn((path: string) => `media://${path}`),
  readyState: 0,
  width: 0,
  height: 0,
  duration: 0,
  currentTime: 0,
  probe: [120, 120, 120, 255] as number[],
  dataUrl: 'data:image/jpeg;base64,FRAME',
  drawImage: vi.fn(),
  throwDraw: false,
  context: null as unknown
}));

vi.mock('@renderer/utils/mediaUrl', () => ({ toMediaServerUrl: state.toMediaUrl }));

import { captureVideoFrame } from '../videoFrameCapture';

const realCreateElement = document.createElement.bind(document);
let videoEl: HTMLVideoElement | null = null;

function canvasContext() {
  return {
    drawImage: (...args: unknown[]) => {
      if (state.throwDraw) throw new Error('draw failed');
      state.drawImage(...args);
    },
    getImageData: () => ({ data: state.probe })
  };
}

function installDom() {
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => state.context,
        toDataURL: () => state.dataUrl
      } as unknown as HTMLElement;
    }
    const el = realCreateElement(tag) as HTMLVideoElement;
    if (tag === 'video') {
      Object.defineProperties(el, {
        readyState: { configurable: true, get: () => state.readyState },
        videoWidth: { configurable: true, get: () => state.width },
        videoHeight: { configurable: true, get: () => state.height },
        duration: { configurable: true, get: () => state.duration },
        currentTime: {
          configurable: true,
          get: () => state.currentTime,
          set: (value: number) => {
            state.currentTime = value;
          }
        }
      });
      videoEl = el;
    }
    return el;
  }) as typeof document.createElement);
}

beforeEach(() => {
  state.toMediaUrl.mockClear();
  state.drawImage.mockReset();
  state.readyState = 0;
  state.width = 0;
  state.height = 0;
  state.duration = 0;
  state.currentTime = 0;
  state.probe = [120, 120, 120, 255];
  state.dataUrl = 'data:image/jpeg;base64,FRAME';
  state.throwDraw = false;
  state.context = canvasContext();
  videoEl = null;
  installDom();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('unsupported input', () => {
  it('ignores non-video files', async () => {
    await expect(captureVideoFrame('D:/song.mp3')).resolves.toEqual({
      type: null,
      data: null
    });
    expect(videoEl).toBeNull();
  });
});

describe('frame capture', () => {
  it('seeks to the first second and returns a JPEG frame', async () => {
    state.readyState = 2;
    state.width = 640;
    state.height = 360;
    state.duration = 10;

    const promise = captureVideoFrame('D:/clip.mp4');

    expect(state.toMediaUrl).toHaveBeenCalledWith('D:/clip.mp4');
    expect(videoEl!.muted).toBe(true);
    expect(videoEl!.playsInline).toBe(true);
    expect(videoEl!.preload).toBe('auto');
    expect(videoEl!.style.cssText).toContain('position: fixed');
    expect(document.body.contains(videoEl!)).toBe(true);

    videoEl!.onloadeddata!(new Event('loadeddata'));
    expect(state.currentTime).toBe(1);

    videoEl!.onseeked!(new Event('seeked'));
    await expect(promise).resolves.toEqual({
      type: 'image',
      data: 'data:image/jpeg;base64,FRAME'
    });
    expect(state.drawImage).toHaveBeenCalledWith(videoEl, 0, 0);
    expect(document.body.contains(videoEl!)).toBe(false);
  });

  it('clamps the seek time to one second without a duration', async () => {
    state.readyState = 2;
    state.width = 10;
    state.height = 10;

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onloadeddata!(new Event('loadeddata'));
    expect(state.currentTime).toBe(1);

    videoEl!.onseeked!(new Event('seeked'));
    await expect(promise).resolves.toMatchObject({ type: 'image' });
  });

  it('draws on canplay when the decoder already has data', async () => {
    state.readyState = 2;
    state.width = 20;
    state.height = 20;

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.oncanplay!(new Event('canplay'));

    await expect(promise).resolves.toMatchObject({ type: 'image' });
  });

  it('waits on canplay while the decoder has no frame', async () => {
    state.readyState = 1;

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.oncanplay!(new Event('canplay'));

    await expect(Promise.race([promise, Promise.resolve('pending')])).resolves.toBe('pending');
  });
});

describe('retries and failures', () => {
  it('retries a black first frame before accepting the capture', async () => {
    vi.useFakeTimers();
    state.readyState = 2;
    state.width = 20;
    state.height = 20;
    state.probe = [0, 0, 0, 255];

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onseeked!(new Event('seeked'));

    await vi.advanceTimersByTimeAsync(120);
    await vi.advanceTimersByTimeAsync(120);

    state.probe = [200, 200, 200, 255];
    await vi.advanceTimersByTimeAsync(120);

    await expect(promise).resolves.toEqual({
      type: 'image',
      data: 'data:image/jpeg;base64,FRAME'
    });
  });

  it('gives up after the draw retry limit', async () => {
    vi.useFakeTimers();
    state.readyState = 1;

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onseeked!(new Event('seeked'));

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ type: null, data: null });
  });

  it('returns null without a 2d context', async () => {
    state.readyState = 2;
    state.width = 20;
    state.height = 20;
    state.context = null;

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onseeked!(new Event('seeked'));

    await expect(promise).resolves.toEqual({ type: null, data: null });
  });

  it('returns null when drawing throws', async () => {
    state.readyState = 2;
    state.width = 20;
    state.height = 20;
    state.throwDraw = true;

    const promise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onseeked!(new Event('seeked'));

    await expect(promise).resolves.toEqual({ type: null, data: null });
  });

  it('returns null on media errors and aborts', async () => {
    const errorPromise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onerror!(new Event('error'));
    await expect(errorPromise).resolves.toEqual({ type: null, data: null });

    const abortPromise = captureVideoFrame('D:/clip.mp4');
    videoEl!.onabort!(new UIEvent('abort'));
    await expect(abortPromise).resolves.toEqual({ type: null, data: null });
  });

  it('times out when the frame never arrives', async () => {
    vi.useFakeTimers();
    const promise = captureVideoFrame('D:/clip.mp4');

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(promise).resolves.toEqual({ type: null, data: null });
    expect(document.body.contains(videoEl!)).toBe(false);
  });

  it('ignores late events after settling', async () => {
    const promise = captureVideoFrame('D:/clip.mp4');

    videoEl!.onerror!(new Event('error'));
    videoEl!.onabort!(new UIEvent('abort'));
    videoEl!.onseeked!(new Event('seeked'));

    await expect(promise).resolves.toEqual({ type: null, data: null });
  });
});
