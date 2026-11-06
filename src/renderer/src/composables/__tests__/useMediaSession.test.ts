import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

// Media Session: navigator/session są podstawione, podobnie jak store i IPC.
const state = vi.hoisted(() => ({
  player: null as any,
  currentTime: { value: 0 },
  duration: { value: 0 },
  session: null as any,
  handlers: new Map<string, ((details?: unknown) => void) | null>(),
  invoke: vi.fn(),
  on: vi.fn(),
  getCover: vi.fn(),
  audioElement: { currentTime: 0 } as { currentTime: number } | null,
  isCoreShell: vi.fn(() => false)
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: { getMediaElement: () => state.audioElement }
}));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.isCoreShell() }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({
  currentTime: state.currentTime,
  duration: state.duration
}));

const { useMediaSession } = await import('../useMediaSession');

class FakeMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork?: Array<{ src: string }>;
  constructor(init: Record<string, unknown>) {
    this.title = String(init.title ?? '');
    this.artist = String(init.artist ?? '');
    this.album = String(init.album ?? '');
    this.artwork = init.artwork as Array<{ src: string }> | undefined;
  }
}

function makeSession() {
  return {
    metadata: null as FakeMediaMetadata | null,
    playbackState: 'none' as string,
    setActionHandler: vi.fn((action: string, handler: ((details?: unknown) => void) | null) => {
      state.handlers.set(action, handler);
    }),
    setPositionState: vi.fn()
  };
}

function makePlayer(track: Record<string, unknown> | null = null) {
  return reactive({
    currentTrack: track,
    isPlaying: true,
    play: vi.fn(),
    pause: vi.fn(),
    prevTrack: vi.fn(),
    nextTrack: vi.fn(),
    seek: vi.fn()
  });
}

function track(overrides: Record<string, unknown> = {}) {
  return {
    path: '/music/a.mp3',
    name: 'Song',
    metadata: { title: 'Title', artist: 'Artist', album: 'Album' },
    thumbnail: '/covers/thumb.jpg',
    ...overrides
  };
}

function installSession(): void {
  state.session = makeSession();
  Object.defineProperty(navigator, 'mediaSession', {
    value: state.session,
    configurable: true
  });
}

function installApi(): void {
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: state.on,
    getCover: state.getCover
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
  state.currentTime.value = 0;
  state.duration.value = 0;
  state.player = makePlayer(track());
  state.handlers = new Map();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(true);
  state.on.mockReset();
  state.on.mockReturnValue(vi.fn());
  state.getCover.mockReset();
  state.getCover.mockResolvedValue({ type: 'image', data: 'data:image/jpeg;base64,xx' });
  state.audioElement = { currentTime: 0 };
  state.isCoreShell.mockReset();
  state.isCoreShell.mockReturnValue(false);
  installSession();
  installApi();
});

afterEach(() => {
  delete (window as { api?: unknown }).api;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('activation', () => {
  it('returns a no-op when Media Session is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const controls = useMediaSession();
    expect(() => controls.dispose()).not.toThrow();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('registers handlers, metadata and position on activation', async () => {
    const controls = useMediaSession();
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('app:getShellActive');

    expect(state.session.setActionHandler).toHaveBeenCalledWith('play', expect.any(Function));
    expect(state.session.setActionHandler).toHaveBeenCalledWith('seekto', expect.any(Function));
    expect(state.session.metadata).toMatchObject({
      title: 'Title',
      artist: 'Artist',
      album: 'Album'
    });
    expect(state.session.metadata?.artwork).toEqual([{ src: 'data:image/jpeg;base64,xx' }]);
    expect(state.session.playbackState).toBe('playing');
    controls.dispose();
  });

  it('activates without the preload bridge', async () => {
    delete (window as { api?: unknown }).api;
    const controls = useMediaSession();
    expect(state.session.metadata).not.toBeNull();
    expect(state.session.playbackState).toBe('playing');
    controls.dispose();
  });

  it('activates when the shell query fails', async () => {
    state.invoke.mockRejectedValue(new Error('ipc'));
    const controls = useMediaSession();
    await flush();
    expect(state.session.metadata).not.toBeNull();
    controls.dispose();
  });

  it('clears handlers and metadata for an inactive shell', async () => {
    let shellListener: ((value: unknown) => void) | null = null;
    state.on.mockImplementation((_channel: string, listener: (value: unknown) => void) => {
      shellListener = listener;
      return vi.fn();
    });
    const controls = useMediaSession();
    await flush();

    shellListener!(false);

    expect(state.session.setActionHandler).toHaveBeenCalledWith('play', null);
    expect(state.session.setActionHandler).toHaveBeenCalledWith('seekto', null);
    expect(state.session.metadata).toBeNull();
    expect(state.session.playbackState).toBe('none');
    expect(state.session.setPositionState).toHaveBeenCalledWith();
    controls.dispose();
  });

  it('re-registers when the shell becomes active again', async () => {
    let shellListener: ((value: unknown) => void) | null = null;
    state.on.mockImplementation((_channel: string, listener: (value: unknown) => void) => {
      shellListener = listener;
      return vi.fn();
    });
    const controls = useMediaSession();
    await flush();
    shellListener!(false);
    state.session.setActionHandler.mockClear();

    shellListener!(true);

    expect(state.session.setActionHandler).toHaveBeenCalledWith('play', expect.any(Function));
    expect(state.session.metadata).not.toBeNull();
    controls.dispose();
  });
});

describe('action handlers', () => {
  async function activate() {
    const controls = useMediaSession();
    await flush();
    return controls;
  }

  it('maps play, pause and track navigation to the store', async () => {
    const controls = await activate();

    state.handlers.get('play')!();
    state.handlers.get('pause')!();
    state.handlers.get('previoustrack')!();
    state.handlers.get('nexttrack')!();

    expect(state.player.play).toHaveBeenCalled();
    expect(state.player.pause).toHaveBeenCalled();
    expect(state.player.prevTrack).toHaveBeenCalled();
    expect(state.player.nextTrack).toHaveBeenCalled();
    controls.dispose();
  });

  it('seeks the store, audio element and video element', async () => {
    state.audioElement = { currentTime: 0 };
    const video = { currentTime: 0 };
    vi.spyOn(document, 'querySelector').mockReturnValue(video as never);
    const controls = await activate();

    state.handlers.get('seekto')!({ seekTime: 42 });

    expect(state.player.seek).toHaveBeenCalledWith(42);
    expect(state.audioElement!.currentTime).toBe(42);
    expect(video.currentTime).toBe(42);
    controls.dispose();
  });

  it('skips the audio element in Core shell but still seeks video', async () => {
    state.isCoreShell.mockReturnValue(true);
    state.audioElement = { currentTime: 0 };
    const video = { currentTime: 0 };
    vi.spyOn(document, 'querySelector').mockReturnValue(video as never);
    const controls = await activate();

    state.handlers.get('seekto')!({ seekTime: 10 });

    expect(state.audioElement!.currentTime).toBe(0);
    expect(video.currentTime).toBe(10);
    controls.dispose();
  });

  it('ignores a seek without a time or while inactive', async () => {
    const controls = await activate();
    const video = { currentTime: 0 };
    vi.spyOn(document, 'querySelector').mockReturnValue(video as never);
    const seek = state.handlers.get('seekto')!;

    seek({ seekTime: null });
    expect(state.player.seek).not.toHaveBeenCalled();

    controls.dispose();
    state.player.seek.mockClear();
    seek({ seekTime: 5 });
    expect(state.player.seek).not.toHaveBeenCalled();
  });
});

describe('metadata and artwork', () => {
  it('clears metadata when the track disappears', async () => {
    const controls = useMediaSession();
    await flush();

    state.player.currentTrack = null;
    await flush();

    expect(state.session.metadata).toBeNull();
    controls.dispose();
  });

  it('updates metadata and playback state when the track changes', async () => {
    const controls = useMediaSession();
    await flush();
    state.player.isPlaying = false;
    state.player.currentTrack = track({
      path: '/music/b.mp3',
      name: 'B',
      metadata: { title: 'B title', artist: 'B artist', album: '' },
      thumbnail: undefined
    });
    await flush();

    expect(state.session.metadata).toMatchObject({ title: 'B title', artist: 'B artist' });
    expect(state.session.playbackState).toBe('paused');
    controls.dispose();
  });

  it('loads a local cover and ignores remote paths', async () => {
    const controls = useMediaSession();
    await flush();
    state.getCover.mockClear();

    state.player.currentTrack = track({ path: 'https://remote/cover.mp3' });
    await flush();
    expect(state.getCover).not.toHaveBeenCalled();

    state.player.currentTrack = track({ path: '/music/local.mp3' });
    await flush();
    expect(state.getCover).toHaveBeenCalledWith('/music/local.mp3');
    expect(state.session.metadata?.artwork).toEqual([{ src: 'data:image/jpeg;base64,xx' }]);

    controls.dispose();
  });

  it('swallows cover errors', async () => {
    state.getCover.mockRejectedValue(new Error('missing'));
    const controls = useMediaSession();
    await flush();
    expect(state.session.metadata).not.toBeNull();
    controls.dispose();
  });
});

describe('position and lifecycle', () => {
  it('publishes a clamped position and ignores invalid durations', async () => {
    state.duration.value = 100;
    state.currentTime.value = 120;
    const controls = useMediaSession();
    await flush();

    expect(state.session.setPositionState).toHaveBeenCalledWith({
      duration: 100,
      position: 100,
      playbackRate: 1
    });

    state.session.setPositionState.mockClear();
    state.duration.value = 0;
    state.player.isPlaying = false;
    await flush();
    expect(state.session.setPositionState).not.toHaveBeenCalled();
    controls.dispose();
  });

  it('refreshes position when playback state changes', async () => {
    state.duration.value = 50;
    state.currentTime.value = 10;
    const controls = useMediaSession();
    await flush();
    state.session.setPositionState.mockClear();

    state.player.isPlaying = false;
    await flush();

    expect(state.session.setPositionState).toHaveBeenCalledWith({
      duration: 50,
      position: 10,
      playbackRate: 1
    });
    controls.dispose();
  });

  it('swallows setPositionState errors', async () => {
    state.duration.value = 10;
    state.session.setPositionState.mockImplementation(() => {
      throw new Error('bad position');
    });
    const controls = useMediaSession();
    await flush();
    expect(() => controls.dispose()).not.toThrow();
  });

  it('dispose unsubscribes and clears the session', async () => {
    const unsubscribe = vi.fn();
    state.on.mockReturnValue(unsubscribe);
    const controls = useMediaSession();
    await flush();

    controls.dispose();

    expect(unsubscribe).toHaveBeenCalled();
    expect(state.session.setActionHandler).toHaveBeenCalledWith('play', null);
    expect(state.session.metadata).toBeNull();
    expect(state.session.playbackState).toBe('none');
  });
});
