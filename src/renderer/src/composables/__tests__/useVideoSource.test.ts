import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MediaFile } from '@renderer/types/media';
import { useVideoSource } from '../useVideoSource';

vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: {
    connectVideoElement: vi.fn(),
    disconnectVideoElement: vi.fn(),
    disconnectSecondaryAudio: vi.fn(),
    setVideoVolume: vi.fn(),
    playSecondaryAudio: vi.fn(),
    pauseSecondaryAudio: vi.fn(),
    hasSecondaryAudio: false
  }
}));

vi.mock('@renderer/composables/useVideoCodec', () => ({
  useVideoCodec: () => ({ checkVideoAudioCodec: vi.fn() })
}));

vi.mock('@renderer/utils/videoElementHandlers', () => ({
  connectVideoEvents: vi.fn(),
  attachVideoTranscodeFallback: vi.fn()
}));

vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`,
  toMediaStreamUrl: (url: string) => `stream://${url}`
}));

function videoTrack(path: string, id = path): MediaFile {
  return {
    id,
    path,
    name: path.split('/').pop() || path,
    type: 'video',
    extension: 'mp4'
  } as MediaFile;
}

function createVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
  video.load = vi.fn();
  video.play = vi.fn().mockResolvedValue(undefined);
  video.pause = vi.fn();
  return video;
}

function markMetadataReady(video: HTMLVideoElement): void {
  Object.defineProperty(video, 'readyState', { configurable: true, value: 1 });
  video.dispatchEvent(new Event('loadedmetadata'));
}

async function flushSetup(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useVideoSource subtitle initialization', () => {
  let onVideoReady: ReturnType<typeof vi.fn>;
  let player: {
    currentTrack: MediaFile | null;
    pipTime: number;
    currentTime: number;
    isPlaying: boolean;
    pipActive: boolean;
    volume: number;
    isMuted: boolean;
    loadSubtitles: ReturnType<typeof vi.fn>;
    clearSubtitles: ReturnType<typeof vi.fn>;
    enrichPendingQueue: ReturnType<typeof vi.fn>;
  };
  let settings: {
    playback: { playbackSpeed: number; videoFilter: string };
  };

  beforeEach(() => {
    onVideoReady = vi.fn();
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { grantMediaAccess: vi.fn().mockResolvedValue(undefined) }
    });
    player = {
      currentTrack: null,
      pipTime: 0,
      currentTime: 0,
      isPlaying: false,
      pipActive: false,
      volume: 1,
      isMuted: false,
      loadSubtitles: vi.fn(),
      clearSubtitles: vi.fn(),
      enrichPendingQueue: vi.fn()
    };
    settings = { playback: { playbackSpeed: 1, videoFilter: 'none' } };
  });

  function createSource() {
    return useVideoSource(
      {
        player: player as never,
        settings: settings as never,
        pip: {} as never,
        notify: vi.fn()
      },
      onVideoReady as never
    );
  }

  it('initializes subtitles after metadata for the first video', async () => {
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;

    source.onVideoRef(video);
    await flushSetup();
    markMetadataReady(video);

    expect(onVideoReady).toHaveBeenCalledTimes(1);
    expect(onVideoReady).toHaveBeenCalledWith(video);
  });

  it('re-initializes subtitles when the video track changes', async () => {
    const source = createSource();
    const video = createVideoElement();
    const first = videoTrack('D:/media/a.mp4');
    player.currentTrack = first;

    source.onVideoRef(video);
    await flushSetup();
    markMetadataReady(video);
    expect(onVideoReady).toHaveBeenCalledTimes(1);

    const second = videoTrack('D:/media/b.mp4');
    player.currentTrack = second;
    source.onTrackChanged(second, first);
    const setup = source.setupVideo(second);
    await setup;
    markMetadataReady(video);

    expect(onVideoReady).toHaveBeenCalledTimes(2);
    expect(onVideoReady).toHaveBeenLastCalledWith(video);
  });

  it('initializes subtitles after switching from audio back to video', async () => {
    const source = createSource();
    const firstVideo = createVideoElement();
    const first = videoTrack('D:/media/a.mp4');
    player.currentTrack = first;

    source.onVideoRef(firstVideo);
    await flushSetup();
    markMetadataReady(firstVideo);

    // Przejście wideo -> audio: element jest odmontowywany, a nowy montuje się
    // dopiero po wybraniu kolejnego wideo.
    source.onVideoRef(null);
    const audio = { ...videoTrack('D:/media/audio.mp3'), type: 'audio' } as MediaFile;
    player.currentTrack = audio;
    source.onTrackChanged(audio, first);

    const secondVideo = createVideoElement();
    const second = videoTrack('D:/media/b.mp4');
    player.currentTrack = second;
    source.onVideoRef(secondVideo);
    source.onTrackChanged(second, audio);
    await flushSetup();
    markMetadataReady(secondVideo);

    expect(onVideoReady).toHaveBeenCalledTimes(2);
    expect(onVideoReady).toHaveBeenLastCalledWith(secondVideo);
  });
});
