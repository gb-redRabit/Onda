import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  audioCtx: null as any,
  gain: {} as any,
  source: {
    connect: vi.fn(),
    disconnect: vi.fn()
  },
  lastEl: null as HTMLAudioElement | null
}));

vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

import { AudioSecondary } from '../audioSecondary';

function installAudio() {
  state.lastEl = null;
  vi.stubGlobal('Audio', function AudioStub() {
    const el = document.createElement('audio');
    state.lastEl = el;
    return el;
  });
}

function make() {
  return new AudioSecondary(state.audioCtx, state.gain);
}

async function connect(secondary: AudioSecondary, path = 'D:/media/a.mkv', offset = 0) {
  const pending = secondary.connect(path, offset);
  await new Promise((resolve) => setTimeout(resolve, 0));
  state.lastEl!.dispatchEvent(new Event('canplay'));
  await pending;
  return state.lastEl!;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});

beforeEach(() => {
  state.loggerWarn.mockReset();
  state.source.connect.mockReset();
  state.source.disconnect.mockReset();
  state.audioCtx = {
    createMediaElementSource: vi.fn(() => state.source)
  };
  state.gain = {};
  (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
  (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>).mockClear();
  (HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mockClear();
  installAudio();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connect', () => {
  it('starts without secondary audio', () => {
    const secondary = make();
    expect(secondary.hasSecondaryAudio).toBe(false);
  });

  it('loads the element and wires it to the gain node', async () => {
    const secondary = make();
    const pending = secondary.connect('D:/media/a.mkv', 5);
    await flush();

    expect(state.lastEl!.crossOrigin).toBe('anonymous');
    expect(state.lastEl!.getAttribute('src')).toBe('media://D:/media/a.mkv');
    expect(state.lastEl!.preload).toBe('auto');
    expect(state.lastEl!.hasAttribute('src')).toBe(true);
    expect(state.audioCtx.createMediaElementSource).not.toHaveBeenCalled();
    expect(secondary.hasSecondaryAudio).toBe(false);

    state.lastEl!.dispatchEvent(new Event('canplay'));
    await pending;

    expect(state.audioCtx.createMediaElementSource).toHaveBeenCalledWith(state.lastEl);
    expect(state.source.connect).toHaveBeenCalledWith(state.gain);
    expect(state.lastEl!.volume).toBe(1);
    expect(secondary.hasSecondaryAudio).toBe(true);
  });

  it('rejects when the element cannot load', async () => {
    const secondary = make();
    const pending = secondary.connect('D:/media/missing.mkv');
    await flush();

    state.lastEl!.dispatchEvent(new Event('error'));

    await expect(pending).rejects.toThrow('Failed to load secondary audio');
    expect(secondary.hasSecondaryAudio).toBe(false);
    expect(state.audioCtx.createMediaElementSource).not.toHaveBeenCalled();
  });

  it('tears down the previous source before connecting again', async () => {
    const secondary = make();
    const first = await connect(secondary);

    const second = await connect(secondary, 'D:/media/b.mkv');

    expect(first).not.toBe(second);
    expect(state.source.disconnect).toHaveBeenCalledTimes(1);
    expect(first.hasAttribute('src')).toBe(false);
    expect(HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(second.getAttribute('src')).toBe('media://D:/media/b.mkv');
    expect(secondary.hasSecondaryAudio).toBe(true);
  });
});

describe('disconnect', () => {
  it('stops the element and clears the source', async () => {
    const secondary = make();
    const el = await connect(secondary);

    secondary.disconnect();

    expect(state.source.disconnect).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('src')).toBe(false);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(secondary.hasSecondaryAudio).toBe(false);
  });

  it('logs source disconnection failures and still cleans up', async () => {
    const secondary = make();
    await connect(secondary);
    state.source.disconnect.mockImplementationOnce(() => {
      throw new Error('already gone');
    });

    secondary.disconnect();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'disconnect secondary source failed',
      expect.any(Error)
    );
    expect(secondary.hasSecondaryAudio).toBe(false);
  });

  it('is a no-op without a connected element', () => {
    const secondary = make();
    expect(() => secondary.disconnect()).not.toThrow();
    expect(state.source.disconnect).not.toHaveBeenCalled();
  });
});

describe('seek', () => {
  it('ignores seeks before connecting', () => {
    const secondary = make();
    expect(() => secondary.seek(10)).not.toThrow();
  });

  it('applies the configured offset and clamps at zero', async () => {
    const secondary = make();
    const el = await connect(secondary, 'D:/media/a.mkv', 5);
    Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });

    secondary.seek(12);
    expect(el.currentTime).toBe(7);

    secondary.timeOffset = 4;
    secondary.seek(6);
    expect(el.currentTime).toBe(2);

    secondary.seek(1);
    expect(el.currentTime).toBe(0);
  });

  it('uses no offset by default', async () => {
    const secondary = make();
    const el = await connect(secondary);
    Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 0 });

    secondary.seek(8);
    expect(el.currentTime).toBe(8);
  });
});

describe('transport', () => {
  it('plays the connected element', async () => {
    const secondary = make();
    await connect(secondary);

    secondary.play();

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it('logs playback rejections', async () => {
    const secondary = make();
    await connect(secondary);
    const error = new Error('blocked');
    (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    secondary.play();
    await Promise.resolve();

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'audioEngine',
      'secondary audio play() rejected',
      error
    );
  });

  it('pauses the connected element', async () => {
    const secondary = make();
    await connect(secondary);

    secondary.pause();

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
  });

  it('ignores transport calls before connecting', () => {
    const secondary = make();
    expect(() => secondary.play()).not.toThrow();
    expect(() => secondary.pause()).not.toThrow();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });
});
