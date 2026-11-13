import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MediaFile } from '@renderer/types/media';
import { i18n } from '@renderer/i18n';
import en from '@renderer/locales/en';
import { logger } from '@shared/logger';
import { audioEngine } from '@renderer/modules/audioEngine';
import { attachVideoTranscodeFallback } from '@renderer/utils/videoElementHandlers';
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
  let notify: ReturnType<typeof vi.fn>;
  let grantMediaAccess: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onVideoReady = vi.fn();
    notify = vi.fn();
    grantMediaAccess = vi.fn().mockResolvedValue(undefined);
    i18n.global.setLocaleMessage('en', en);
    i18n.global.locale.value = 'en';
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { grantMediaAccess }
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
        notify: notify as never
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

  it('tells the user when the video element fails to load', async () => {
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/broken.mp4');
    player.currentTrack = track;

    source.onVideoRef(video);
    await flushSetup();
    video.dispatchEvent(new Event('error'));

    expect(notify).toHaveBeenCalledTimes(1);
    expect(String(notify.mock.calls[0][0])).toContain('broken.mp4');
    expect(notify.mock.calls[0][1]).toBe(5000);
  });

  it('exposes the configured video filter and ignores none', () => {
    const source = createSource();
    expect(source.videoFilterStyle.value).toEqual({});

    settings.playback.videoFilter = 'contrast(1.2)';
    expect(createSource().videoFilterStyle.value).toEqual({ filter: 'contrast(1.2)' });
  });

  it('maps local, remote and proxied track paths to their sources', () => {
    const source = createSource();

    expect(source.getTrackSrc({ path: '/stream?provider=mega' })).toBe('/stream?provider=mega');
    expect(source.getTrackSrc({ path: 'https://cdn.example/v.mp4' })).toBe(
      'stream://https://cdn.example/v.mp4'
    );
    expect(source.getTrackSrc({ path: 'D:/media/a.mp4' })).toBe('media://D:/media/a.mp4');
  });

  it('ignores setup for missing, non-video or unmounted elements', async () => {
    const source = createSource();

    await source.setupVideo(null);
    await source.setupVideo({ ...videoTrack('D:/media/a.mp3'), type: 'audio' } as MediaFile);
    await source.setupVideo(videoTrack('D:/media/a.mp4'));

    expect(grantMediaAccess).not.toHaveBeenCalled();
  });

  it('streams remote sources without local access or codec checks', async () => {
    const source = createSource();
    const video = createVideoElement();
    source.onVideoRef(video);

    const remote = videoTrack('https://cdn.example/v.mp4');
    player.currentTrack = remote;
    player.isPlaying = true;
    await source.setupVideo(remote);

    expect(grantMediaAccess).not.toHaveBeenCalled();
    expect(audioEngine.connectVideoElement).toHaveBeenCalledWith(video);
    expect(attachVideoTranscodeFallback).not.toHaveBeenCalled();

    video.dispatchEvent(new Event('canplay'));
    await flushSetup();
    expect(video.play).toHaveBeenCalled();

    video.dispatchEvent(new Event('playing'));
    expect(player.enrichPendingQueue).toHaveBeenCalled();

    video.dispatchEvent(new Event('error'));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('seeks to the picture-in-picture time and resets it when the source changes', async () => {
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;
    player.pipTime = 12;
    player.currentTime = 5;

    source.onVideoRef(video);
    await flushSetup();
    markMetadataReady(video);

    expect(video.currentTime).toBe(12);
    expect(player.pipTime).toBe(0);
  });

  it('reuses the existing source, keeps the volume in sync and resumes playback', async () => {
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;

    source.onVideoRef(video);
    await flushSetup();
    markMetadataReady(video);
    expect(onVideoReady).toHaveBeenCalledTimes(1);

    player.isPlaying = true;
    player.volume = 0.7;
    await source.setupVideo(track);
    expect(audioEngine.setVideoVolume).toHaveBeenLastCalledWith(0.7);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(onVideoReady).toHaveBeenCalledTimes(1);

    player.isMuted = true;
    await source.setupVideo(track);
    expect(audioEngine.setVideoVolume).toHaveBeenLastCalledWith(0);
  });

  it('waits for metadata when reusing a source that is still loading', async () => {
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;

    source.onVideoRef(video);
    await flushSetup();
    markMetadataReady(video);
    expect(onVideoReady).toHaveBeenCalledTimes(1);

    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
    await source.setupVideo(track);
    markMetadataReady(video);

    expect(onVideoReady).toHaveBeenCalledTimes(1);
  });

  it('drops a late metadata event from an unmounted element', async () => {
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;

    source.onVideoRef(video);
    await flushSetup();
    await source.setupVideo(track);
    source.onVideoRef(null);
    video.dispatchEvent(new Event('loadedmetadata'));

    expect(onVideoReady).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
    expect(player.clearSubtitles).toHaveBeenCalled();
    expect(audioEngine.disconnectVideoElement).toHaveBeenCalled();
  });

  it('ignores a setup that was superseded while access was pending', async () => {
    const source = createSource();
    const video = createVideoElement();
    const first = videoTrack('D:/media/a.mp4');
    const second = videoTrack('D:/media/b.mp4');
    player.currentTrack = first;

    source.onVideoRef(video);
    player.currentTrack = second;
    await source.setupVideo(second);
    await flushSetup();

    expect(video.getAttribute('data-src')).toBe('media://D:/media/b.mp4');
  });

  it('does not duplicate the toast when transcoding already handled the failure', async () => {
    vi.mocked(attachVideoTranscodeFallback).mockImplementationOnce(
      (_el, track, _player, _notify, state) => {
        state.attempted = track.path;
      }
    );
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;

    source.onVideoRef(video);
    await flushSetup();
    video.dispatchEvent(new Event('error'));

    expect(notify).not.toHaveBeenCalled();
  });

  it('logs rejected autoplay and resume attempts', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const source = createSource();
    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;
    player.isPlaying = true;

    source.onVideoRef(video);
    await flushSetup();

    video.play = vi.fn().mockRejectedValueOnce(new Error('blocked'));
    video.dispatchEvent(new Event('canplay'));
    await flushSetup();
    expect(warn).toHaveBeenCalledWith('video', 'autoplay rejected', expect.any(Error));

    video.play = vi.fn().mockRejectedValueOnce(new Error('blocked again'));
    await source.setupVideo(track);
    await flushSetup();
    expect(warn).toHaveBeenCalledWith('video', 'resume play rejected', expect.any(Error));

    warn.mockRestore();
  });

  it('keeps the event wiring for a remounted element', () => {
    const source = createSource();
    const video = createVideoElement();

    source.onVideoRef(video);
    source.onVideoRef(video);

    expect(source.videoRef.value).toBe(video);
  });

  it('ignores canplay while paused and unmounts without an element', async () => {
    const source = createSource();
    source.onVideoRef(null);

    const video = createVideoElement();
    const track = videoTrack('D:/media/a.mp4');
    player.currentTrack = track;
    player.isPlaying = false;
    source.onVideoRef(video);
    await flushSetup();

    video.dispatchEvent(new Event('canplay'));

    expect(video.play).not.toHaveBeenCalled();
  });

  it('keeps the loaded state when the track path is unchanged', () => {
    const source = createSource();
    const track = videoTrack('D:/media/a.mp4');

    source.onTrackChanged(track, track);
    source.onTrackChanged(null, null);
  });
});
