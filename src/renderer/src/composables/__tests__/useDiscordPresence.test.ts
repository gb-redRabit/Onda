import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';
import { useDiscordPresence } from '../useDiscordPresence';

const state = vi.hoisted(() => ({
  settings: null as any,
  player: null as any,
  coreShell: false,
  configure: vi.fn(),
  update: vi.fn(),
  resolveCover: vi.fn(),
  resolveLocal: vi.fn(),
  splitTitle: vi.fn((raw: string, artist?: string) => ({ title: raw, artist: artist ?? '' }))
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.coreShell }));
vi.mock('@shared/discord-title', () => ({ splitTitle: state.splitTitle }));

const Harness = defineComponent({
  props: { headless: { type: Boolean, default: false } },
  setup(props) {
    useDiscordPresence({ headless: props.headless });
    return () => h('div');
  }
});

let wrapper: VueWrapper | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'file.mp3',
    path: 'C:\\music\\a.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    metadata: { title: 'Song', artist: 'Artist', album: 'Album' },
    duration: 200,
    addedAt: 0,
    playCount: 0,
    ...overrides
  } as never;
}

function mountPresence(headless = false) {
  wrapper = mount(Harness, { props: { headless } });
  return wrapper;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = reactive({
    general: {
      discordRichPresence: true,
      discordClientId: 'client-id',
      discordUploadLocalCovers: false,
      discordOnlineCovers: true
    }
  });
  state.player = reactive({
    currentTrack: track(),
    isPlaying: true,
    currentTime: 12,
    duration: 0
  });
  state.coreShell = false;
  state.configure.mockReset();
  state.update.mockReset();
  state.resolveCover.mockReset();
  state.resolveCover.mockResolvedValue('https://cover');
  state.resolveLocal.mockReset();
  state.resolveLocal.mockResolvedValue(null);
  state.splitTitle.mockClear();
  (window as { api?: unknown }).api = {
    configureDiscord: state.configure,
    updateDiscordPresence: state.update,
    resolveDiscordCover: state.resolveCover,
    resolveLocalDiscordCover: state.resolveLocal
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { api?: unknown }).api;
});

describe('configuration and push', () => {
  it('does nothing in the core shell', async () => {
    state.coreShell = true;
    mountPresence();
    await flush();
    expect(state.configure).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it('syncs immediately in headless mode', async () => {
    mountPresence(true);
    await flush();

    expect(state.configure).toHaveBeenCalledWith({
      enabled: true,
      clientId: 'client-id'
    });
    expect(state.update).toHaveBeenCalled();

    state.settings.general.discordRichPresence = false;
    await flush();
  });

  it('syncs on mount for the renderer shell', async () => {
    mountPresence();
    await flush();
    expect(state.configure).toHaveBeenCalled();
    expect(state.update).toHaveBeenCalled();
  });

  it('pushes the mapped presence state', async () => {
    state.player.currentTrack = track({
      metadata: { title: 'Song', artist: 'Artist', album: 'Album' },
      thumbnail: 'https://img/cover.png'
    });
    state.player.isPlaying = true;
    state.player.currentTime = 12;
    mountPresence();
    await flush();

    expect(state.update).toHaveBeenCalledWith({
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      kind: 'audio',
      isPlaying: true,
      positionSec: 12,
      durationSec: 200,
      coverUrl: 'https://img/cover.png'
    });
  });

  it('maps video and stream kinds and duration rules', async () => {
    state.player.currentTrack = track({ type: 'video' });
    state.player.duration = 250;
    mountPresence();
    await flush();
    expect(state.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'video', durationSec: 250 })
    );

    state.player.currentTrack = track({ type: 'stream' });
    await flush();
    expect(state.update).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'stream' }));
    expect(state.update.mock.calls.at(-1)![0]).not.toHaveProperty('durationSec');
  });

  it('falls back to the file name and omits non-http thumbnails', async () => {
    state.player.currentTrack = track({
      name: 'fallback.mp3',
      metadata: {},
      thumbnail: 'data:image/png;base64,x'
    });
    mountPresence();
    await flush();

    expect(state.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'fallback.mp3' })
    );
    expect(state.update.mock.calls.at(-1)![0]).not.toHaveProperty('coverUrl');
  });

  it('sends a null presence when no track is playing', async () => {
    state.player.currentTrack = null;
    mountPresence();
    await flush();
    expect(state.update).toHaveBeenCalledWith(null);
  });

  it('does nothing when rich presence is disabled', async () => {
    state.settings.general.discordRichPresence = false;
    mountPresence();
    await flush();

    expect(state.configure).toHaveBeenCalledWith({ enabled: false, clientId: 'client-id' });
    expect(state.update).not.toHaveBeenCalled();
  });

  it('pushes on the interval while enabled', async () => {
    mountPresence();
    await flush();
    const pushes = state.update.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.update.mock.calls.length).toBeGreaterThan(pushes);

    state.settings.general.discordRichPresence = false;
    await flush();
    const paused = state.update.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.update.mock.calls.length).toBe(paused);
  });
});

describe('online covers', () => {
  it('looks up and applies an online cover', async () => {
    state.player.currentTrack = track({ thumbnail: undefined });
    mountPresence();
    await flush();

    expect(state.resolveCover).toHaveBeenCalledWith({
      artist: 'Artist',
      title: 'Song',
      album: 'Album'
    });
    expect(state.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverUrl: 'https://cover' })
    );
  });

  it('caches hits and misses within one session', async () => {
    state.player.currentTrack = track({ thumbnail: undefined });
    mountPresence();
    await flush();
    expect(state.resolveCover).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverUrl: 'https://cover' })
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.resolveCover).toHaveBeenCalledTimes(1);

    state.resolveCover.mockResolvedValue(null);
    state.player.currentTrack = track({
      path: 'C:\\music\\b.mp3',
      thumbnail: undefined,
      metadata: { title: 'Other', artist: 'Other artist', album: 'Other album' }
    });
    await flush();
    expect(state.resolveCover).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.resolveCover).toHaveBeenCalledTimes(2);
  });

  it('skips lookups without an artist or title', async () => {
    state.player.currentTrack = track({ metadata: { title: 'Only title' }, thumbnail: undefined });
    mountPresence();
    await flush();
    expect(state.resolveCover).not.toHaveBeenCalled();
  });

  it('caches failures as misses', async () => {
    state.resolveCover.mockRejectedValueOnce(new Error('network'));
    state.player.currentTrack = track({ thumbnail: undefined });
    mountPresence();
    await flush();
    expect(state.resolveCover).toHaveBeenCalledTimes(1);
    expect(state.update.mock.calls.at(-1)![0]).not.toHaveProperty('coverUrl');
  });

  it('drops the cover when the track changed before the lookup resolved', async () => {
    let resolveCover!: (value: string | null) => void;
    state.resolveCover.mockReturnValueOnce(new Promise((resolve) => (resolveCover = resolve)));
    state.player.currentTrack = track({ thumbnail: undefined });
    mountPresence();
    await flush();

    state.player.currentTrack = track({
      path: 'C:\\music\\other.mp3',
      thumbnail: undefined,
      metadata: { title: 'Different', artist: 'Different artist' }
    });
    resolveCover('https://stale');
    await flush();

    expect(state.update.mock.calls.some((call) => call[0]?.coverUrl === 'https://stale')).toBe(
      false
    );
  });

  it('drops the cover when playback changed before the lookup resolved', async () => {
    let resolveCover!: (value: string | null) => void;
    state.resolveCover.mockReturnValueOnce(new Promise((resolve) => (resolveCover = resolve)));
    state.player.currentTrack = track({ thumbnail: undefined });
    mountPresence();
    await flush();

    state.player.isPlaying = false;
    resolveCover('https://late');
    await flush();
    expect(state.update.mock.calls.some((call) => call[0]?.coverUrl === 'https://late')).toBe(
      false
    );
  });

  it('does not look up covers while paused, for streams or with a cover already set', async () => {
    state.player.isPlaying = false;
    state.player.currentTrack = track({ thumbnail: undefined });
    mountPresence();
    await flush();
    expect(state.resolveCover).not.toHaveBeenCalled();

    state.player.isPlaying = true;
    state.player.currentTrack = track({ type: 'stream', thumbnail: undefined });
    await flush();
    expect(state.resolveCover).not.toHaveBeenCalled();

    state.player.currentTrack = track({ type: 'image', thumbnail: undefined });
    await flush();
    expect(state.resolveCover).not.toHaveBeenCalled();

    state.player.currentTrack = track({ thumbnail: 'https://direct' });
    await flush();
    expect(state.resolveCover).not.toHaveBeenCalled();
  });
});

describe('local covers', () => {
  beforeEach(() => {
    state.settings.general.discordUploadLocalCovers = true;
    state.player.currentTrack = track({ thumbnail: undefined, mtime: 123 });
  });

  it('publishes a local cover and caches it', async () => {
    state.resolveLocal.mockResolvedValue('local://cover');
    mountPresence();
    await flush();

    expect(state.resolveLocal).toHaveBeenCalledWith('C:\\music\\a.mp3');
    expect(state.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverUrl: 'local://cover' })
    );
    expect(state.resolveCover).not.toHaveBeenCalled();

    state.player.currentTime = 20;
    await flush();
    expect(state.resolveLocal).toHaveBeenCalledTimes(1);
  });

  it('falls back to online covers when no local cover exists', async () => {
    state.resolveLocal.mockResolvedValue(null);
    mountPresence();
    await flush();
    expect(state.resolveCover).toHaveBeenCalled();
  });

  it('deduplicates pending local lookups', async () => {
    let resolveLocal!: (value: string | null) => void;
    state.resolveLocal.mockReturnValueOnce(new Promise((resolve) => (resolveLocal = resolve)));
    mountPresence();
    await flush();
    state.player.currentTime = 20;
    await flush();

    expect(state.resolveLocal).toHaveBeenCalledTimes(1);
    resolveLocal('local://one');
    await flush();
  });

  it('does not publish a local cover after the track changed', async () => {
    let resolveLocal!: (value: string | null) => void;
    state.resolveLocal.mockReturnValueOnce(new Promise((resolve) => (resolveLocal = resolve)));
    mountPresence();
    await flush();

    state.player.currentTrack = track({ path: 'C:\\music\\b.mp3', thumbnail: undefined });
    resolveLocal('local://stale');
    await flush();
    expect(state.update.mock.calls.some((call) => call[0]?.coverUrl === 'local://stale')).toBe(
      false
    );
  });
});

describe('watchers and cleanup', () => {
  it('pushes when the track or play state changes', async () => {
    mountPresence();
    await flush();
    state.update.mockClear();

    state.player.currentTrack = track({ path: 'C:\\music\\b.mp3' });
    await flush();
    expect(state.update).toHaveBeenCalled();

    state.update.mockClear();
    state.player.isPlaying = false;
    await flush();
    expect(state.update).toHaveBeenCalled();
  });

  it('reconfigures when rich presence settings change', async () => {
    mountPresence();
    await flush();
    state.configure.mockClear();

    state.settings.general.discordRichPresence = false;
    await flush();
    expect(state.configure).toHaveBeenCalledWith({ enabled: false, clientId: 'client-id' });

    state.settings.general.discordClientId = 'other';
    await flush();
    expect(state.configure).toHaveBeenLastCalledWith({ enabled: false, clientId: 'other' });
  });

  it('pushes when cover settings change', async () => {
    mountPresence();
    await flush();
    state.update.mockClear();

    state.settings.general.discordOnlineCovers = false;
    await flush();
    expect(state.update).toHaveBeenCalled();

    state.update.mockClear();
    state.settings.general.discordUploadLocalCovers = true;
    await flush();
    expect(state.update).toHaveBeenCalled();
  });

  it('clears the interval and presence on unmount', async () => {
    mountPresence();
    await flush();
    state.update.mockClear();

    wrapper!.unmount();
    wrapper = null;
    expect(state.update).toHaveBeenCalledWith(null);

    const calls = state.update.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.update.mock.calls.length).toBe(calls);
  });
});
