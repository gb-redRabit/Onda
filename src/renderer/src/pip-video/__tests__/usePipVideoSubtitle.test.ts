import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';

const state = vi.hoisted(() => ({
  createJassub: vi.fn(),
  loadWasm: vi.fn(),
  loggerError: vi.fn(),
  offsetSeconds: vi.fn((ms: number) => ms / 1000),
  instance: null as any,
  video: null as any,
  wasmDeferred: [] as Array<(value: { wasmDataUrl: string; modernWasmDataUrl: string }) => void>,
  createDeferred: [] as Array<(value: any) => void>
}));

vi.mock('jassub', () => ({ default: class JassubMock {} }));
vi.mock('@renderer/utils/jassub', () => ({
  createJassub: state.createJassub,
  loadJassubWasmDataUrls: state.loadWasm
}));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@renderer/composables/subtitleDelay', () => ({
  subtitleTimeOffsetSeconds: state.offsetSeconds
}));

import { usePipVideoSubtitle, type PipSubtitleData } from '../usePipVideoSubtitle';

function data(overrides: Partial<PipSubtitleData> = {}): PipSubtitleData {
  return {
    subContent: '[Script Info]\nTitle: test',
    fonts: [{ name: 'Arial', data: [1, 2, 3] } as never],
    availableFonts: { Arial: 'fonts/arial.ttf' },
    subtitleDelayMs: 250,
    ...overrides
  };
}

let app: ReturnType<typeof createApp> | null = null;

function mountSubtitle() {
  let api: ReturnType<typeof usePipVideoSubtitle> | null = null;
  app = createApp({
    setup() {
      api = usePipVideoSubtitle(state.video);
      return () => h('div');
    }
  });
  app.mount(document.createElement('div'));
  return api as unknown as ReturnType<typeof usePipVideoSubtitle>;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function wasmDeferred() {
  return new Promise<{ wasmDataUrl: string; modernWasmDataUrl: string }>((resolve) => {
    state.wasmDeferred.push(resolve);
  });
}

function createDeferred() {
  return new Promise<any>((resolve) => {
    state.createDeferred.push(resolve);
  });
}

beforeEach(() => {
  state.createJassub.mockReset();
  state.instance = { destroy: vi.fn(), timeOffset: 0 };
  state.createJassub.mockResolvedValue(state.instance);
  state.loadWasm.mockReset();
  state.loadWasm.mockResolvedValue({
    wasmDataUrl: 'data:wasm',
    modernWasmDataUrl: 'data:modern'
  });
  state.loggerError.mockReset();
  state.offsetSeconds.mockClear();
  state.wasmDeferred = [];
  state.createDeferred = [];
  state.video = ref({ currentTime: 0 } as HTMLVideoElement);
});

afterEach(() => {
  app?.unmount();
  app = null;
});

describe('loading', () => {
  it('creates JASSUB with fonts, resolved asset URLs and the delay offset', async () => {
    const api = mountSubtitle();
    expect(api.subsVisible.value).toBe(true);

    api.receiveSubtitle(data());
    await flush();

    expect(state.createJassub).toHaveBeenCalledTimes(1);
    const [ctor, options] = state.createJassub.mock.calls[0];
    expect(ctor).toBeDefined();
    expect(options.video).toBe(state.video.value);
    expect(options.subContent).toContain('[Script Info]');
    expect(options.fonts[0]).toBeInstanceOf(Uint8Array);
    expect([...options.fonts[0]]).toEqual([1, 2, 3]);
    expect(options.availableFonts.Arial).toBe(new URL('fonts/arial.ttf', document.baseURI).href);
    expect(options.queryFonts).toBe('local');
    expect(options.wasmUrlOverride).toBe('data:wasm');
    expect(options.modernWasmUrlOverride).toBe('data:modern');
    expect(options.timeOffset).toBe(0.25);
    expect(state.offsetSeconds).toHaveBeenCalledWith(250);
  });

  it('keeps unparsable font URLs untouched', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data({ availableFonts: { Broken: 'http://[' } }));
    await flush();

    expect(state.createJassub.mock.calls[0][1].availableFonts.Broken).toBe('http://[');
  });

  it('uses a zero offset when no delay is provided', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data({ subtitleDelayMs: undefined }));
    await flush();

    expect(state.offsetSeconds).toHaveBeenCalledWith(0);
  });

  it('does nothing without a video element', async () => {
    const api = mountSubtitle();
    state.video.value = null;

    api.receiveSubtitle(data());
    await flush();

    expect(state.createJassub).not.toHaveBeenCalled();
  });

  it('logs and destroys on initialization failure', async () => {
    state.loadWasm.mockRejectedValueOnce(new Error('wasm'));
    const api = mountSubtitle();

    api.receiveSubtitle(data());
    await flush();

    expect(state.loggerError).toHaveBeenCalledWith(
      'pip-video',
      'JASSUB init failed – subtitles disabled',
      expect.any(Error)
    );
  });
});

describe('stale loads', () => {
  it('ignores a load that finishes after a newer one started', async () => {
    const api = mountSubtitle();
    state.loadWasm.mockImplementationOnce(() => wasmDeferred());
    state.loadWasm.mockImplementationOnce(() => wasmDeferred());

    api.receiveSubtitle(data({ subContent: 'first' }));
    api.receiveSubtitle(data({ subContent: 'second' }));
    await flush();
    expect(state.wasmDeferred).toHaveLength(2);

    state.wasmDeferred[1]({ wasmDataUrl: 'b', modernWasmDataUrl: 'b' });
    await flush();
    state.wasmDeferred[0]({ wasmDataUrl: 'a', modernWasmDataUrl: 'a' });
    await flush();

    expect(state.createJassub).toHaveBeenCalledTimes(1);
    expect(state.createJassub.mock.calls[0][1].subContent).toBe('second');
  });

  it('destroys an instance that resolves after being superseded', async () => {
    const api = mountSubtitle();
    state.createJassub.mockImplementationOnce(() => createDeferred());

    api.receiveSubtitle(data({ subContent: 'first' }));
    await flush();
    api.receiveSubtitle(data({ subContent: 'second' }));
    await flush();

    const late = { destroy: vi.fn(), timeOffset: 0 };
    state.createDeferred[0](late);
    await flush();

    expect(late.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('visibility', () => {
  it('clears the overlay and can restore the last subtitle', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data());
    await flush();
    const first = state.instance;

    api.toggleSubtitles();
    expect(api.subsVisible.value).toBe(false);
    expect(first.destroy).toHaveBeenCalled();

    state.createJassub.mockResolvedValueOnce({ destroy: vi.fn(), timeOffset: 0 });
    api.toggleSubtitles();
    await flush();

    expect(api.subsVisible.value).toBe(true);
    expect(state.createJassub).toHaveBeenCalledTimes(2);
  });

  it('does not restore when nothing was received', () => {
    const api = mountSubtitle();
    api.toggleSubtitles();
    expect(api.subsVisible.value).toBe(false);
    expect(state.createJassub).not.toHaveBeenCalled();
  });

  it('clears on an empty or null payload', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data());
    await flush();
    const instance = state.instance;

    api.receiveSubtitle(null);

    expect(instance.destroy).toHaveBeenCalled();
    expect(api.subsVisible.value).toBe(true);
  });

  it('clears when the payload has no script content', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data({ subContent: '' }));
    await flush();
    expect(state.createJassub).not.toHaveBeenCalled();
  });
});

describe('delay-only updates', () => {
  it('updates the offset without rebuilding JASSUB', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data({ subtitleDelayMs: 100 }));
    await flush();
    expect(state.createJassub).toHaveBeenCalledTimes(1);

    api.receiveSubtitle(data({ subtitleDelayMs: 750 }));
    await flush();

    expect(state.createJassub).toHaveBeenCalledTimes(1);
    expect(state.instance.timeOffset).toBe(0.75);
    expect(state.offsetSeconds).toHaveBeenLastCalledWith(750);
  });

  it('rebuilds when the content changes', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data({ subtitleDelayMs: 100 }));
    await flush();

    api.receiveSubtitle(data({ subContent: 'other', subtitleDelayMs: 100 }));
    await flush();

    expect(state.createJassub).toHaveBeenCalledTimes(2);
  });
});

describe('cleanup', () => {
  it('destroys the instance on unmount', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data());
    await flush();

    app!.unmount();
    app = null;

    expect(state.instance.destroy).toHaveBeenCalled();
  });

  it('swallows destroy failures', async () => {
    const api = mountSubtitle();
    api.receiveSubtitle(data());
    await flush();

    state.instance.destroy.mockImplementation(() => {
      throw new Error('broken');
    });

    expect(() => api.clearSubtitle()).not.toThrow();
  });
});
