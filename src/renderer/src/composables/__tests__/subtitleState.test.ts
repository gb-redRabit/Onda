import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

const state = vi.hoisted(() => ({
  delayRef: null as any,
  offset: vi.fn(),
  createJassub: vi.fn(),
  loggerError: vi.fn(),
  instance: null as any
}));

vi.mock('../subtitleDelay', () => ({
  get subtitleDelayMs() {
    return state.delayRef;
  },
  subtitleTimeOffsetSeconds: state.offset
}));
vi.mock('@renderer/utils/jassub', () => ({ createJassub: state.createJassub }));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));
vi.mock('jassub', () => ({ default: class JassubMock {} }));

async function load() {
  vi.resetModules();
  return import('../subtitleState');
}

function subtitle(overrides: Record<string, unknown> = {}) {
  return {
    subContent: '[Script Info]',
    fonts: [{ name: 'Arial', ext: 'ttf', data: [1, 2] }],
    availableFonts: { Arial: 'fonts/a.ttf', Blob: 'blob:abc' },
    ...overrides
  } as never;
}

beforeEach(() => {
  state.delayRef = ref(0);
  state.offset.mockReset();
  state.offset.mockImplementation(() => state.delayRef.value / 1000);
  state.instance = { destroy: vi.fn(), timeOffset: 0 };
  state.createJassub.mockReset();
  state.createJassub.mockResolvedValue(state.instance);
  state.loggerError.mockReset();
});

describe('ensureJASSUB', () => {
  it('loads and caches the class', async () => {
    const { ensureJASSUB } = await load();
    const ctor = await ensureJASSUB();

    expect(ctor).toBeTypeOf('function');
    expect(await ensureJASSUB()).toBe(ctor);
  });

  it('logs and returns null when the chunk is unavailable', async () => {
    vi.doMock('jassub', () => {
      throw new Error('missing chunk');
    });
    const { ensureJASSUB } = await load();

    await expect(ensureJASSUB()).resolves.toBeNull();
    expect(state.loggerError.mock.calls[0][0]).toBe('Subtitles');
    expect(state.loggerError.mock.calls[0][1]).toBe('Failed to load JASSUB');
    vi.doMock('jassub', () => ({ default: class JassubMock {} }));
  });
});

describe('video element', () => {
  it('stores and clears the current element', async () => {
    const { getVideoElement, setVideoElement, clearVideoElement } = await load();
    const video = {} as HTMLVideoElement;

    expect(getVideoElement()).toBeNull();
    setVideoElement(video);
    expect(getVideoElement()).toBe(video);
    clearVideoElement();
    expect(getVideoElement()).toBeNull();
  });
});

describe('load sequence', () => {
  it('tracks the latest load token', async () => {
    const { newSubtitleLoadSeq, isSubtitleLoadCurrent } = await load();

    const first = newSubtitleLoadSeq();
    expect(isSubtitleLoadCurrent(first)).toBe(true);

    const second = newSubtitleLoadSeq();
    expect(isSubtitleLoadCurrent(second)).toBe(true);
    expect(isSubtitleLoadCurrent(first)).toBe(false);
  });
});

describe('createJassubInstance', () => {
  async function ready() {
    const api = await load();
    api.setVideoElement({ id: 'video' } as unknown as HTMLVideoElement);
    return api;
  }

  it('does nothing without a video element', async () => {
    const { createJassubInstance } = await load();
    expect(
      await createJassubInstance(class {} as never, {
        subContent: 's',
        fonts: [],
        availableFonts: {},
        isCurrent: () => true
      })
    ).toBe(false);
    expect(state.createJassub).not.toHaveBeenCalled();
  });

  it('creates an instance with the current delay offset', async () => {
    state.delayRef.value = 250;
    const api = await ready();
    const ctor = class {} as never;

    const ok = await api.createJassubInstance(ctor, {
      subContent: '[Script Info]',
      fonts: [new Uint8Array([1])],
      availableFonts: { Arial: 'a.ttf' },
      isCurrent: () => true
    });

    expect(ok).toBe(true);
    expect(state.createJassub).toHaveBeenCalledWith(ctor, {
      video: { id: 'video' },
      subContent: '[Script Info]',
      fonts: [new Uint8Array([1])],
      availableFonts: { Arial: 'a.ttf' },
      timeOffset: 0.25
    });
  });

  it('destroys an instance that became stale', async () => {
    const api = await ready();
    const stale = { destroy: vi.fn(), timeOffset: 0 };
    state.createJassub.mockResolvedValueOnce(stale);

    const ok = await api.createJassubInstance(class {} as never, {
      subContent: 's',
      fonts: [],
      availableFonts: {},
      isCurrent: () => false
    });

    expect(ok).toBe(false);
    expect(stale.destroy).toHaveBeenCalledTimes(1);

    api.setSubtitleTimeOffset(9);
    expect(stale.timeOffset).toBe(0);
  });

  it('logs initialization failures only while current', async () => {
    const api = await ready();
    state.createJassub.mockRejectedValueOnce(new Error('bad'));

    const ok = await api.createJassubInstance(class {} as never, {
      subContent: 's',
      fonts: [],
      availableFonts: {},
      isCurrent: () => true
    });

    expect(ok).toBe(false);
    expect(state.loggerError).toHaveBeenCalledWith(
      'Subtitles',
      'Failed to initialize JASSUB',
      expect.any(Error)
    );
  });

  it('stays quiet when a stale attempt fails', async () => {
    const api = await ready();
    state.createJassub.mockRejectedValueOnce(new Error('bad'));

    const ok = await api.createJassubInstance(class {} as never, {
      subContent: 's',
      fonts: [],
      availableFonts: {},
      isCurrent: () => false
    });

    expect(ok).toBe(false);
    expect(state.loggerError).not.toHaveBeenCalled();
  });
});

describe('instance operations', () => {
  async function withInstance() {
    const api = await load();
    api.setVideoElement({} as HTMLVideoElement);
    state.instance = { destroy: vi.fn(), timeOffset: 0 };
    state.createJassub.mockResolvedValue(state.instance);
    await api.createJassubInstance(class {} as never, {
      subContent: 's',
      fonts: [],
      availableFonts: {},
      isCurrent: () => true
    });
    return api;
  }

  it('sets the time offset on the live instance', async () => {
    const api = await withInstance();

    api.setSubtitleTimeOffset(1.5);
    expect(state.instance.timeOffset).toBe(1.5);

    api.setSubtitleTimeOffset(4);
    expect(state.instance.timeOffset).toBe(4);
  });

  it('applies the stored delay', async () => {
    state.delayRef.value = 900;
    const api = await withInstance();

    api.applySubtitleDelay();

    expect(state.instance.timeOffset).toBe(0.9);
  });

  it('reacts to delay changes', async () => {
    await withInstance();

    state.delayRef.value = 500;
    await nextTick();

    expect(state.instance.timeOffset).toBe(0.5);
  });

  it('destroys the instance once', async () => {
    const api = await withInstance();

    api.destroySubtitleInstance();
    expect(state.instance.destroy).toHaveBeenCalledTimes(1);

    expect(() => api.destroySubtitleInstance()).not.toThrow();
    expect(state.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it('ignores offsets without an instance', async () => {
    const api = await load();
    expect(() => api.setSubtitleTimeOffset(3)).not.toThrow();
    expect(() => api.destroySubtitleInstance()).not.toThrow();
  });
});

describe('last subtitle data', () => {
  it('returns null before anything was saved', async () => {
    const { getLastSubtitleData } = await load();
    expect(getLastSubtitleData()).toBeNull();
  });

  it('copies data and filters blob fonts', async () => {
    const { getLastSubtitleData, saveLastSubtitleData } = await load();
    saveLastSubtitleData(subtitle());

    expect(getLastSubtitleData()).toEqual({
      subContent: '[Script Info]',
      fonts: [{ name: 'Arial', ext: 'ttf', data: [1, 2] }],
      availableFonts: { Arial: 'fonts/a.ttf' }
    });
  });

  it('defaults the extension and tolerates missing fields', async () => {
    const { getLastSubtitleData, saveLastSubtitleData } = await load();
    saveLastSubtitleData({
      subContent: 'x',
      fonts: [{ name: 'NoExt', data: undefined }],
      availableFonts: { Weird: 42 as unknown as string }
    } as never);

    const data = getLastSubtitleData()!;
    expect(data.fonts).toEqual([{ name: 'NoExt', ext: 'ttf', data: [] }]);
    expect(data.availableFonts).toEqual({});
  });
});
