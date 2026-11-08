import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useScrobbling } from '../useScrobbling';

const state = vi.hoisted(() => ({
  player: null as any,
  settings: null as any,
  core: false,
  currentTime: null as any,
  duration: null as any,
  isPlaying: null as any,
  shouldScrobble: vi.fn(),
  toScrobbleTrack: vi.fn(),
  invoke: vi.fn(),
  warn: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.core }));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('@renderer/utils/scrobbler', () => ({
  shouldScrobble: state.shouldScrobble,
  toScrobbleTrack: state.toScrobbleTrack
}));
vi.mock('../useAudioPlayer', async () => {
  const { ref } = await import('vue');
  state.currentTime = ref(0);
  state.duration = ref(0);
  state.isPlaying = ref(false);
  return {
    currentTime: state.currentTime,
    duration: state.duration,
    isPlaying: state.isPlaying
  };
});

let wrapper: VueWrapper | null = null;

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `C:/music/${id}.mp3`,
    name: `${id}.mp3`,
    type: 'audio',
    duration: 200,
    metadata: { artist: 'Artist', title: 'Title', album: 'Album' },
    ...overrides
  } as any;
}

function setup() {
  const Comp = defineComponent({
    setup() {
      useScrobbling();
      return () => h('div');
    }
  });
  wrapper = mount(Comp);
  return wrapper;
}

function enable() {
  state.settings.apiKeys.keys = [{ id: 'scrobble:lastfm-session', isActive: true }];
}

function disable() {
  state.settings.apiKeys.keys = [{ id: 'scrobble:lastfm-session', isActive: false }];
}

function payloadFor(id = 'a') {
  return { id: `payload-${id}` };
}

let addSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.player = reactive({ currentTrack: null });
  state.settings = reactive({ apiKeys: { keys: [] as any[] } });
  state.core = false;
  state.currentTime.value = 0;
  state.duration.value = 0;
  state.isPlaying.value = false;
  state.shouldScrobble.mockReset();
  state.shouldScrobble.mockImplementation((elapsed: number) => elapsed >= 50);
  state.toScrobbleTrack.mockReset();
  state.toScrobbleTrack.mockImplementation((t: any) => payloadFor(t.id));
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.warn.mockReset();
  (window as { api?: unknown }).api = { invoke: state.invoke };
  addSpy = vi.spyOn(window, 'addEventListener');
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

function unloadListener(): () => void {
  const call = addSpy.mock.calls.find((entry: any[]) => entry[0] === 'beforeunload');
  return call![1] as () => void;
}

describe('setup guards', () => {
  it('does nothing in the core shell', () => {
    state.core = true;
    setup();
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('registers a one-shot unload listener', () => {
    setup();
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function), { once: true });
  });
});

describe('now playing', () => {
  it('sends now playing when an enabled audio track starts playing', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();

    expect(state.toScrobbleTrack).toHaveBeenCalledWith(
      state.player.currentTrack,
      200,
      1_700_000_000
    );
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:nowPlaying', payloadFor('a'));
  });

  it('waits for playback before sending now playing', async () => {
    enable();
    setup();
    state.player.currentTrack = track('a');
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalled();

    state.isPlaying.value = true;
    await nextTick();
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:nowPlaying', payloadFor('a'));
  });

  it('does nothing when scrobbling is disabled', async () => {
    disable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.toScrobbleTrack).not.toHaveBeenCalled();
  });

  it('accepts listenbrainz tokens as enabled', async () => {
    state.settings.apiKeys.keys = [{ id: 'scrobble:listenbrainz-token', isActive: true }];
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:nowPlaying', payloadFor('a'));
  });

  it('skips video and radio tracks', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('v', { type: 'video' });
    await nextTick();
    state.player.currentTrack = track('radio:1');
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('sends now playing only once per track', async () => {
    enable();
    setup();
    state.player.currentTrack = track('a');
    await nextTick();
    state.isPlaying.value = true;
    await nextTick();
    state.currentTime.value = 10;
    await nextTick();
    expect(
      state.invoke.mock.calls.filter((call) => call[0] === 'scrobbling:nowPlaying')
    ).toHaveLength(1);
  });

  it('uses the actual playback start timestamp', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 30;
    await nextTick();
    state.player.currentTrack = track('b');
    await nextTick();

    expect(state.toScrobbleTrack).toHaveBeenLastCalledWith(
      state.player.currentTrack,
      200,
      1_700_000_000
    );
  });

  it('derives the timestamp when playback started before enabling', async () => {
    disable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a', { duration: 200 });
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    enable();
    state.player.currentTrack = track('b');
    await nextTick();
    expect(state.toScrobbleTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      200,
      1_699_999_900
    );
  });
});

describe('duration tracking', () => {
  it('uses the reported duration for audio tracks', async () => {
    enable();
    setup();
    state.player.currentTrack = track('a');
    await nextTick();
    state.isPlaying.value = true;
    await nextTick();

    state.duration.value = 321;
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    // The scrobble of "a" uses the reported duration.
    expect(state.toScrobbleTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      321,
      expect.any(Number)
    );
  });

  it('ignores non-positive durations and non-audio tracks', async () => {
    enable();
    setup();
    state.player.currentTrack = track('a');
    await nextTick();
    state.duration.value = 0;
    await nextTick();
    state.player.currentTrack = track('v', { type: 'video' });
    await nextTick();
    state.duration.value = 500;
    await nextTick();
    expect(state.shouldScrobble).not.toHaveBeenCalledWith(expect.anything(), 500);
  });
});

describe('scrobbling thresholds', () => {
  it('scrobbles once when the threshold is reached', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();

    state.currentTime.value = 100;
    await nextTick();
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:scrobble', payloadFor('a'));

    state.currentTime.value = 120;
    await nextTick();
    expect(
      state.invoke.mock.calls.filter((call) => call[0] === 'scrobbling:scrobble')
    ).toHaveLength(1);
    expect(state.toScrobbleTrack).toHaveBeenCalledWith(
      state.player.currentTrack,
      200,
      1_700_000_000
    );
  });

  it('respects the threshold helper', async () => {
    enable();
    state.shouldScrobble.mockReturnValue(false);
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalledWith('scrobbling:scrobble', expect.anything());
  });

  it('ignores time updates while paused or for videos', async () => {
    enable();
    setup();
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 50;
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalled();

    state.player.currentTrack = track('v', { type: 'video' });
    state.isPlaying.value = true;
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('resets the session when the track restarts', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    expect(
      state.invoke.mock.calls.filter((call) => call[0] === 'scrobbling:scrobble')
    ).toHaveLength(1);

    state.currentTime.value = 2;
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    expect(
      state.invoke.mock.calls.filter((call) => call[0] === 'scrobbling:scrobble')
    ).toHaveLength(2);
  });

  it('skips tracks without a payload', async () => {
    enable();
    state.toScrobbleTrack.mockReturnValue(null);
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalledWith('scrobbling:scrobble', expect.anything());
  });
});

describe('track changes and unloading', () => {
  it('finishes the previous track before switching', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 40;
    await nextTick();
    state.shouldScrobble.mockReturnValue(true);
    state.invoke.mockClear();

    state.player.currentTrack = track('b');
    await nextTick();
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:scrobble', payloadFor('a'));
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:nowPlaying', payloadFor('b'));
  });

  it('does not scrobble the previous track twice or when disabled', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 100;
    await nextTick();
    state.invoke.mockClear();

    state.player.currentTrack = track('b');
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalledWith('scrobbling:scrobble', expect.anything());

    state.player.currentTrack = track('c');
    await nextTick();
    disable();
    state.player.currentTrack = track('d');
    await nextTick();
    expect(state.invoke).not.toHaveBeenCalledWith('scrobbling:scrobble', expect.anything());
  });

  it('scrobbles the final track on unload', async () => {
    enable();
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    state.currentTime.value = 40;
    await nextTick();
    state.shouldScrobble.mockReturnValue(true);
    state.invoke.mockClear();

    unloadListener()();
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:scrobble', payloadFor('a'));
  });

  it('does nothing on unload without a scrobbleable track', async () => {
    enable();
    state.shouldScrobble.mockReturnValue(false);
    setup();
    state.player.currentTrack = track('a');
    await nextTick();
    unloadListener()();
    expect(state.invoke).not.toHaveBeenCalledWith('scrobbling:scrobble', expect.anything());
  });

  it('logs IPC failures without throwing', async () => {
    enable();
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    setup();
    state.isPlaying.value = true;
    state.player.currentTrack = track('a');
    await nextTick();
    await Promise.resolve();
    expect(state.warn).toHaveBeenCalledWith(
      'scrobbling',
      'scrobbling:nowPlaying failed',
      expect.any(Error)
    );
  });
});
