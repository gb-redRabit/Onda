import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useVideoPlayer } from '../useVideoPlayer';

const state = vi.hoisted(() => ({
  player: null as any,
  settings: null as any,
  pip: null as any,
  notify: vi.fn(),
  audioEngine: null as any,
  ensureLocalVideoAudio: vi.fn(),
  source: null as any,
  subtitles: null as any,
  pipCtrl: null as any,
  warn: vi.fn()
}));

vi.mock('@renderer/modules/audioEngine', () => ({
  get audioEngine() {
    return state.audioEngine;
  }
}));
vi.mock('@renderer/composables/useAudioPlayer', () => ({
  ensureLocalVideoAudio: state.ensureLocalVideoAudio
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../useVideoSource', () => ({
  useVideoSource: () => state.source
}));
vi.mock('../useVideoSubtitles', () => ({
  useVideoSubtitles: () => state.subtitles
}));
vi.mock('../useVideoPiP', () => ({
  useVideoPiP: () => state.pipCtrl
}));

let wrapper: VueWrapper | null = null;
let exposed: ReturnType<typeof useVideoPlayer>;
let video: any;

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    path: 'C:/video/a.mp4',
    name: 'a.mp4',
    type: 'video',
    metadata: {},
    ...overrides
  } as any;
}

function setup() {
  const Comp = defineComponent({
    setup() {
      exposed = useVideoPlayer({
        player: state.player,
        settings: state.settings,
        pip: state.pip,
        notify: state.notify
      } as never);
      return () => h('div');
    }
  });
  wrapper = mount(Comp);
  return wrapper;
}

beforeEach(() => {
  video = {
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    playbackRate: 1
  };
  state.player = reactive({
    currentTrack: null,
    isPlaying: false,
    pipActive: false,
    volume: 0.7,
    isMuted: false
  });
  state.settings = reactive({ playback: { playbackSpeed: 1.25 } });
  state.pip = {};
  state.notify.mockReset();
  state.ensureLocalVideoAudio.mockReset();
  state.audioEngine = {
    disconnectVideoElement: vi.fn(),
    disconnectSecondaryAudio: vi.fn(),
    pauseSecondaryAudio: vi.fn(),
    playSecondaryAudio: vi.fn(),
    setVideoVolume: vi.fn(),
    setVolume: vi.fn(),
    hasSecondaryAudio: false
  };
  state.source = {
    videoRef: ref(video),
    videoFilterStyle: ref({ filter: 'x' }),
    onVideoRef: vi.fn(),
    setupVideo: vi.fn(),
    onTrackChanged: vi.fn(),
    getTrackSrc: vi.fn()
  };
  state.subtitles = {
    onVideoReady: vi.fn(),
    syncSubtitlesWithPiP: vi.fn(),
    registerSubtitleWatcher: vi.fn(),
    destroySubtitles: vi.fn()
  };
  state.pipCtrl = {
    togglePiP: vi.fn(),
    updatePiPSubtitles: vi.fn()
  };
  state.warn.mockReset();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('setup and returned API', () => {
  it('registers watchers and exposes source/PiP helpers', () => {
    setup();
    expect(state.subtitles.registerSubtitleWatcher).toHaveBeenCalled();
    expect(exposed.videoRef).toBe(state.source.videoRef);
    expect(exposed.videoFilterStyle).toBe(state.source.videoFilterStyle);
    expect(exposed.onVideoRef).toBe(state.source.onVideoRef);
    expect(exposed.togglePiP).toBe(state.pipCtrl.togglePiP);
    expect(exposed.syncSubtitlesWithPiP).toBe(state.subtitles.syncSubtitlesWithPiP);
  });

  it('initialises audio only for video tracks', () => {
    setup();
    exposed.init(track());
    expect(state.ensureLocalVideoAudio).toHaveBeenCalled();
    expect(state.pipCtrl.updatePiPSubtitles).not.toHaveBeenCalled();

    exposed.init(track({ type: 'audio' }));
    exposed.init(null);
    expect(state.ensureLocalVideoAudio).toHaveBeenCalledTimes(1);
  });

  it('updates PiP subtitles when the player is already in PiP', () => {
    state.player.pipActive = true;
    setup();
    const item = track();
    exposed.init(item);
    expect(state.pipCtrl.updatePiPSubtitles).toHaveBeenCalledWith(item, true);
  });

  it('destroys media, audio and subtitles', () => {
    setup();
    exposed.destroy();
    expect(state.audioEngine.disconnectVideoElement).toHaveBeenCalled();
    expect(state.audioEngine.disconnectSecondaryAudio).toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
    expect(state.subtitles.destroySubtitles).toHaveBeenCalled();
  });

  it('destroys safely without a video element', () => {
    state.source.videoRef = ref(null);
    setup();
    expect(() => exposed.destroy()).not.toThrow();
    expect(state.subtitles.destroySubtitles).toHaveBeenCalled();
  });
});

describe('track changes', () => {
  it('sets up video, notifies and handles PiP', async () => {
    state.player.pipActive = true;
    setup();
    const item = track({ metadata: { title: 'Clip', artist: 'Artist' } });
    state.player.currentTrack = item;
    await nextTick();

    expect(state.source.onTrackChanged).toHaveBeenCalled();
    expect(state.ensureLocalVideoAudio).toHaveBeenCalled();
    expect(state.source.setupVideo).toHaveBeenCalledWith(item);
    expect(state.pipCtrl.updatePiPSubtitles).toHaveBeenCalledWith(item, true);
    expect(video.pause).toHaveBeenCalled();
    expect(state.player.isPlaying).toBe(false);
    expect(state.notify).toHaveBeenCalledWith('Artist - Clip', 2500);
  });

  it('uses the file name and notifies without an artist', async () => {
    setup();
    state.player.currentTrack = track();
    await nextTick();
    expect(state.notify).toHaveBeenCalledWith('a.mp4', 2500);
  });

  it('ignores non-video tracks', async () => {
    setup();
    state.player.currentTrack = track({ type: 'audio' });
    await nextTick();
    expect(state.source.onTrackChanged).toHaveBeenCalled();
    expect(state.source.setupVideo).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();

    state.player.currentTrack = null;
    await nextTick();
    expect(state.source.setupVideo).not.toHaveBeenCalled();
  });
});

describe('playback state', () => {
  it('plays and pauses video with secondary audio', async () => {
    state.player.currentTrack = track();
    setup();
    await nextTick();

    state.player.isPlaying = true;
    await nextTick();
    expect(video.play).toHaveBeenCalled();
    expect(state.audioEngine.playSecondaryAudio).toHaveBeenCalled();

    state.player.isPlaying = false;
    await nextTick();
    expect(video.pause).toHaveBeenCalled();
    expect(state.audioEngine.pauseSecondaryAudio).toHaveBeenCalled();
  });

  it('pauses for picture-in-picture', async () => {
    state.player.currentTrack = track();
    setup();
    await nextTick();
    state.player.pipActive = true;
    state.player.isPlaying = true;
    await nextTick();
    expect(video.pause).toHaveBeenCalled();
    expect(state.audioEngine.pauseSecondaryAudio).toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it('ignores playback changes without video', async () => {
    setup();
    state.player.currentTrack = null;
    state.player.isPlaying = true;
    await nextTick();
    expect(video.play).not.toHaveBeenCalled();

    state.player.currentTrack = track({ type: 'audio' });
    await nextTick();
    expect(video.play).not.toHaveBeenCalled();
  });

  it('logs rejected play calls', async () => {
    state.player.currentTrack = track();
    setup();
    await nextTick();
    video.play.mockRejectedValueOnce(new Error('blocked'));
    state.player.isPlaying = true;
    await nextTick();
    await Promise.resolve();
    expect(state.warn).toHaveBeenCalledWith('video', 'play rejected', expect.any(Error));
  });

  it('applies playback speed', async () => {
    setup();
    state.settings.playback.playbackSpeed = 2;
    await nextTick();
    expect(video.playbackRate).toBe(2);
  });

  it('routes volume through secondary audio when present', async () => {
    setup();
    state.audioEngine.hasSecondaryAudio = true;
    state.player.volume = 0.4;
    await nextTick();
    expect(state.audioEngine.setVideoVolume).toHaveBeenCalledWith(0);
    expect(state.audioEngine.setVolume).toHaveBeenCalledWith(0.4);

    state.player.isMuted = true;
    await nextTick();
    expect(state.audioEngine.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('uses video volume without secondary audio', async () => {
    setup();
    state.player.volume = 0.3;
    await nextTick();
    expect(state.audioEngine.setVideoVolume).toHaveBeenCalledWith(0.3);

    state.player.isMuted = true;
    await nextTick();
    expect(state.audioEngine.setVideoVolume).toHaveBeenLastCalledWith(0);
  });

  it('ignores volume changes without a video element', async () => {
    state.source.videoRef = ref(null);
    setup();
    state.player.volume = 0.2;
    await nextTick();
    expect(state.audioEngine.setVideoVolume).not.toHaveBeenCalled();
  });
});
