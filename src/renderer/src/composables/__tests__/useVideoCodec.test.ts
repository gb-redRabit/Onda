import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const state = vi.hoisted(() => ({
  engine: null as any,
  t: vi.fn((key: string) => key),
  notify: vi.fn(),
  player: null as any,
  checkAudioCodec: vi.fn(),
  transcodeAudioChunk: vi.fn(),
  transcodeAudio: vi.fn()
}));

vi.mock('@renderer/modules/audioEngine', () => ({
  get audioEngine() {
    return state.engine;
  }
}));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: state.t } } }));

import { useVideoCodec } from '../useVideoCodec';
import type { MediaFile } from '@renderer/types/media';

function track(path = 'D:/video/a.mkv'): MediaFile {
  return { path, name: 'a.mkv', type: 'video' } as never;
}

function videoElement(currentTime = 12, paused = false): HTMLVideoElement {
  return { currentTime, paused } as HTMLVideoElement;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  return useVideoCodec({ player: state.player, notify: state.notify });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.engine = {
    setVideoVolume: vi.fn(),
    connectSecondaryAudio: vi.fn(async () => undefined),
    playSecondaryAudio: vi.fn(),
    disconnectSecondaryAudio: vi.fn(),
    seekSecondaryAudio: vi.fn()
  };
  state.t.mockClear();
  state.notify.mockReset();
  state.player = reactive({ isMuted: false, volume: 0.7, isPlaying: true });
  state.checkAudioCodec.mockReset();
  state.checkAudioCodec.mockResolvedValue({ supported: true });
  state.transcodeAudioChunk.mockReset();
  state.transcodeAudioChunk.mockResolvedValue('D:/chunk.ogg');
  state.transcodeAudio.mockReset();
  state.transcodeAudio.mockResolvedValue('D:/full.ogg');
  (window as unknown as { api?: unknown }).api = {
    checkAudioCodec: state.checkAudioCodec,
    transcodeAudioChunk: state.transcodeAudioChunk,
    transcodeAudio: state.transcodeAudio
  };
});

describe('supported codecs', () => {
  it('does nothing when the codec is supported', async () => {
    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.setVideoVolume).not.toHaveBeenCalled();
    expect(state.transcodeAudioChunk).not.toHaveBeenCalled();
  });

  it('does nothing without a result', async () => {
    state.checkAudioCodec.mockResolvedValueOnce(undefined);
    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.setVideoVolume).not.toHaveBeenCalled();
  });

  it('works without the bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    await expect(setup().checkVideoAudioCodec(track(), videoElement())).resolves.toBeUndefined();
  });
});

describe('transcoding', () => {
  beforeEach(() => {
    state.checkAudioCodec.mockResolvedValue({ supported: false });
  });

  it('mutes the video, plays a chunk and then the full track', async () => {
    await setup().checkVideoAudioCodec(track(), videoElement(12));

    expect(state.engine.setVideoVolume).toHaveBeenCalledWith(0);
    expect(state.transcodeAudioChunk).toHaveBeenCalledWith('D:/video/a.mkv', 12, 30);
    expect(state.engine.connectSecondaryAudio).toHaveBeenNthCalledWith(1, 'D:/chunk.ogg', 12);
    expect(state.engine.playSecondaryAudio).toHaveBeenCalledTimes(2);
    expect(state.engine.disconnectSecondaryAudio).toHaveBeenCalledTimes(1);
    expect(state.engine.connectSecondaryAudio).toHaveBeenNthCalledWith(2, 'D:/full.ogg', 0);
    expect(state.engine.seekSecondaryAudio).toHaveBeenCalledWith(12);
  });

  it('does not autoplay while the element is paused', async () => {
    state.player.isPlaying = false;
    await setup().checkVideoAudioCodec(track(), videoElement(12, true));

    expect(state.engine.playSecondaryAudio).not.toHaveBeenCalled();
  });

  it('skips playback when only the chunk is available', async () => {
    state.transcodeAudio.mockResolvedValueOnce('D:/chunk.ogg');
    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.connectSecondaryAudio).toHaveBeenCalledTimes(1);
    expect(state.engine.disconnectSecondaryAudio).not.toHaveBeenCalled();
  });

  it('falls back to the full track when the chunk fails to connect', async () => {
    state.engine.connectSecondaryAudio.mockRejectedValueOnce(new Error('chunk'));
    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.transcodeAudio).toHaveBeenCalledWith('D:/video/a.mkv');
    expect(state.engine.connectSecondaryAudio).toHaveBeenLastCalledWith('D:/full.ogg', 0);
  });

  it('skips the chunk when it is not produced', async () => {
    state.transcodeAudioChunk.mockResolvedValueOnce(undefined);
    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.connectSecondaryAudio).toHaveBeenCalledTimes(1);
    expect(state.engine.connectSecondaryAudio).toHaveBeenCalledWith('D:/full.ogg', 0);
  });

  it('restores volume and notifies when the full track cannot connect', async () => {
    state.engine.connectSecondaryAudio.mockRejectedValueOnce(new Error('chunk'));
    state.engine.connectSecondaryAudio.mockRejectedValueOnce(new Error('full'));

    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.setVideoVolume).toHaveBeenLastCalledWith(0.7);
    expect(state.notify).toHaveBeenCalledWith('player.audioPlaybackFailed', 3000);
  });

  it('restores volume when transcoding is unavailable and retries next time', async () => {
    state.transcodeAudioChunk.mockResolvedValue(undefined);
    state.transcodeAudio.mockResolvedValue(undefined);
    const codec = setup();

    await codec.checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.setVideoVolume).toHaveBeenLastCalledWith(0.7);
    expect(state.notify).toHaveBeenCalledWith('player.audioCodecUnsupported', 5000);

    await codec.checkVideoAudioCodec(track(), videoElement());
    expect(state.checkAudioCodec).toHaveBeenCalledTimes(2);
  });

  it('keeps volume at zero when muted', async () => {
    state.player.isMuted = true;
    state.transcodeAudioChunk.mockResolvedValue(undefined);
    state.transcodeAudio.mockResolvedValue(undefined);

    await setup().checkVideoAudioCodec(track(), videoElement());

    expect(state.engine.setVideoVolume).toHaveBeenLastCalledWith(0);
  });

  it('checks each track only once', async () => {
    const codec = setup();
    await codec.checkVideoAudioCodec(track(), videoElement());
    await codec.checkVideoAudioCodec(track(), videoElement());

    expect(state.checkAudioCodec).toHaveBeenCalledTimes(1);
  });
});

describe('stale analyses', () => {
  it('does not mute when a newer track superseded the check', async () => {
    const pending = deferred<{ supported: boolean }>();
    state.checkAudioCodec.mockReturnValueOnce(pending.promise);
    state.checkAudioCodec.mockResolvedValueOnce({ supported: true });
    const codec = setup();

    const first = codec.checkVideoAudioCodec(track('D:/a.mkv'), videoElement());
    await flush();
    await codec.checkVideoAudioCodec(track('D:/b.mkv'), videoElement());
    pending.resolve({ supported: false });
    await first;

    expect(state.engine.setVideoVolume).not.toHaveBeenCalled();
    expect(state.transcodeAudioChunk).not.toHaveBeenCalled();
  });

  it('restores volume when a newer track starts mid-transcode', async () => {
    const pending = deferred<string | undefined>();
    state.checkAudioCodec.mockResolvedValue({ supported: false });
    state.transcodeAudioChunk.mockReturnValueOnce(pending.promise);
    const codec = setup();

    const first = codec.checkVideoAudioCodec(track('D:/a.mkv'), videoElement());
    await flush();
    expect(state.engine.setVideoVolume).toHaveBeenCalledWith(0);

    state.checkAudioCodec.mockResolvedValueOnce({ supported: true });
    await codec.checkVideoAudioCodec(track('D:/b.mkv'), videoElement());
    pending.resolve('D:/chunk.ogg');
    await first;

    expect(state.engine.setVideoVolume).toHaveBeenLastCalledWith(0.7);
    expect(state.transcodeAudio).not.toHaveBeenCalled();
  });

  it('restores volume when a newer track starts before the full track', async () => {
    const pending = deferred<string | undefined>();
    state.checkAudioCodec.mockResolvedValue({ supported: false });
    state.transcodeAudioChunk.mockResolvedValue(undefined);
    state.transcodeAudio.mockReturnValueOnce(pending.promise);
    const codec = setup();

    const first = codec.checkVideoAudioCodec(track('D:/a.mkv'), videoElement());
    await flush();
    state.checkAudioCodec.mockResolvedValueOnce({ supported: true });
    await codec.checkVideoAudioCodec(track('D:/b.mkv'), videoElement());
    pending.resolve('D:/full.ogg');
    await first;

    expect(state.engine.setVideoVolume).toHaveBeenLastCalledWith(0.7);
    expect(state.engine.connectSecondaryAudio).not.toHaveBeenCalled();
  });
});
