import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const state = vi.hoisted(() => ({
  api: null as any,
  settings: null as any,
  player: null as any,
  audio: null as any,
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  intervals: [] as Array<{ id: number; ms: number; cb: () => void }>,
  nextTimerId: 0,
  ensure: vi.fn(),
  scrobbling: vi.fn(),
  discord: vi.fn(),
  clearCalls: [] as number[],
  bootSends: [] as unknown[][],
  bootEvidence: null as any,
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock('pinia', () => ({ createPinia: () => ({}), setActivePinia: vi.fn() }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => state.audio }));
vi.mock('@renderer/composables/useScrobbling', () => ({ useScrobbling: state.scrobbling }));
vi.mock('@renderer/composables/useDiscordPresence', () => ({
  useDiscordPresence: state.discord
}));
vi.mock('@renderer/utils/mediaUrl', () => ({ ensureMediaServerUrl: state.ensure }));
vi.mock('@shared/core-state', () => ({
  toPlainTrack: (track: unknown) => (track ? { ...(track as object) } : null)
}));

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function sends(channel: string): unknown[] {
  return state.api.send.mock.calls
    .filter((c: unknown[]) => c[0] === channel)
    .map((c: unknown[]) => c[1]);
}

function command(payload: unknown): void {
  state.handlers['core:command'](payload);
}

function timer(ms: number) {
  return state.intervals.find((entry) => entry.ms === ms)!;
}

function makeTrack(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `${id}.mp3`,
    path: `C:\\music\\${id}.mp3`,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0,
    ...overrides
  };
}

function resetState(): void {
  const player = state.player;
  player.currentTrack = null;
  player.queue = [];
  player.pendingQueue = [];
  player.history = [];
  player.volume = 0.7;
  player.isMuted = false;
  player.shuffle = false;
  player.repeat = 'none';
  player.pipActive = false;
  player.pipTime = 0;
  player.currentTime = 42;
  player.isPlaying = false;
  for (const fn of [
    'setVolume',
    'setTrack',
    'play',
    'pause',
    'togglePlay',
    'seek',
    'toggleMute',
    'toggleShuffle',
    'cycleRepeat',
    'nextTrack',
    'prevTrack',
    'playFromHistory',
    'clearTrack'
  ]) {
    player[fn].mockClear();
  }

  const audio = state.audio;
  audio.currentTime.value = 0;
  audio.duration.value = 0;
  audio.buffered.value = 0;
  audio.isPlaying.value = false;
  audio.isLoading.value = false;
  audio.error.value = null;
  for (const fn of [
    'seek',
    'setVolume',
    'applyEqBands',
    'setEqEnabled',
    'setEqPreamp',
    'setEqMono',
    'setNightMode',
    'setAudioDelay',
    'applyEqGraph',
    'getAnalyserNode'
  ]) {
    audio[fn].mockClear();
  }
  audio.getAnalyserNode.mockReturnValue(null);

  state.api.send.mockClear();
  state.clearCalls.length = 0;
  state.ensure.mockClear();
  state.discord.mockClear();
  state.scrobbling.mockClear();
  state.settings.load.mockClear();

  // Stop any viz interval left over from a previous test and drop its state.
  command({ type: 'viz', active: false });
  state.intervals = state.intervals.filter((entry) => entry.ms === 250);
  state.api.send.mockClear();
}

beforeAll(async () => {
  state.settings = {
    load: vi.fn(async () => undefined),
    playback: { defaultVolume: 0.7 }
  };
  state.player = {
    currentTrack: null,
    queue: [],
    pendingQueue: [],
    history: [],
    volume: 0.7,
    isMuted: false,
    shuffle: false,
    repeat: 'none',
    pipActive: false,
    pipTime: 0,
    currentTime: 42,
    isPlaying: false,
    setVolume: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
    toggleMute: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    playFromHistory: vi.fn(),
    clearTrack: vi.fn()
  };
  state.audio = {
    currentTime: ref(0),
    duration: ref(0),
    buffered: ref(0),
    isPlaying: ref(false),
    isLoading: ref(false),
    error: ref<string | null>(null),
    seek: vi.fn(),
    setVolume: vi.fn(),
    applyEqBands: vi.fn(),
    setEqEnabled: vi.fn(),
    setEqPreamp: vi.fn(),
    setEqMono: vi.fn(),
    setNightMode: vi.fn(),
    setAudioDelay: vi.fn(),
    applyEqGraph: vi.fn(),
    getAnalyserNode: vi.fn(() => null)
  };
  state.ensure.mockResolvedValue(undefined);
  state.api = {
    send: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      state.handlers[event] = cb;
    })
  };
  (window as { api?: unknown }).api = state.api;

  vi.stubGlobal('setInterval', (cb: () => void, ms: number) => {
    const id = ++state.nextTimerId;
    state.intervals.push({ id, ms, cb });
    return id;
  });
  vi.stubGlobal('clearInterval', (id: number) => {
    state.clearCalls.push(id);
    state.intervals = state.intervals.filter((entry) => entry.id !== id);
  });

  await import('../main');
  await flush();
  state.bootSends = state.api.send.mock.calls.map((call: unknown[]) => [...call]);
  state.bootEvidence = {
    ensure: state.ensure.mock.calls.length,
    settings: state.settings.load.mock.calls.length,
    volume: state.player.setVolume.mock.calls.map((call: unknown[]) => [...call]),
    scrobbling: state.scrobbling.mock.calls.length,
    discord: state.discord.mock.calls.map((call: unknown[]) => [...call])
  };
});

beforeEach(() => {
  resetState();
});

describe('boot', () => {
  it('loads settings and announces a full state plus readiness', () => {
    const channels = state.bootSends.map((call) => call[0]);
    expect(channels).toContain('core:state');
    expect(channels).toContain('core:ready');

    expect(state.bootEvidence.ensure).toBeGreaterThan(0);
    expect(state.bootEvidence.settings).toBeGreaterThan(0);
    expect(state.bootEvidence.volume).toContainEqual([0.7]);
    expect(state.bootEvidence.scrobbling).toBeGreaterThan(0);
    expect(state.bootEvidence.discord).toContainEqual([{ headless: true }]);

    const ready = state.bootSends.find((call) => call[0] === 'core:ready');
    expect(ready?.[1]).toBe(true);

    const full = state.bootSends.find((call) => call[0] === 'core:state')?.[1] as Record<
      string,
      unknown
    >;
    expect(full).toMatchObject({
      current: null,
      queue: [],
      pendingQueue: [],
      history: [],
      revision: 1,
      volume: 0.7,
      isMuted: false,
      shuffle: false,
      repeat: 'none',
      pipActive: false,
      pipTime: 0
    });
    expect(full.error).toBeNull();
  });

  it('registers the command handler and the 250 ms tick', () => {
    expect(state.handlers['core:command']).toBeTypeOf('function');
    expect(state.intervals.some((entry) => entry.ms === 250)).toBe(true);
  });

  it('reports window errors and unhandled rejections', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    expect(sends('core:error').at(-1)).toBe('window error: boom');

    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('nope') });
    window.dispatchEvent(rejection);
    expect(sends('core:error').at(-1)).toBe('unhandled rejection: nope');

    const plain = new Event('unhandledrejection');
    Object.defineProperty(plain, 'reason', { value: 'text' });
    window.dispatchEvent(plain);
    expect(sends('core:error').at(-1)).toBe('unhandled rejection: text');
  });
});

describe('state broadcasting', () => {
  it('sends a full state when the structure changes and a tick otherwise', () => {
    const counter = timer(250);
    state.player.currentTrack = makeTrack('a');

    counter.cb();
    expect(sends('core:state')).toHaveLength(1);
    expect(sends('core:tick')).toHaveLength(0);

    counter.cb();
    expect(sends('core:tick')).toHaveLength(1);

    state.player.volume = 0.2;
    counter.cb();
    expect(sends('core:state')).toHaveLength(2);
  });

  it('includes plain tracks and engine values in the full state', () => {
    state.player.currentTrack = makeTrack('a');
    state.player.queue = [makeTrack('b')];
    state.player.pendingQueue = [makeTrack('c')];
    state.player.history = [makeTrack('d')];
    state.audio.currentTime.value = 12;
    state.audio.duration.value = 60;
    state.audio.buffered.value = 30;
    state.audio.isPlaying.value = true;
    state.audio.isLoading.value = true;
    state.player.isPlaying = true;

    command({ type: 'play' });
    const full = sends('core:state').at(-1) as Record<string, unknown>;
    expect(full.current).toMatchObject({ id: 'a' });
    expect(full.queue).toEqual([expect.objectContaining({ id: 'b' })]);
    expect(full.pendingQueue).toEqual([expect.objectContaining({ id: 'c' })]);
    expect(full.history).toEqual([expect.objectContaining({ id: 'd' })]);
    expect(full).toMatchObject({
      currentTime: 12,
      duration: 60,
      buffered: 30,
      isPlaying: true,
      enginePlaying: true,
      isLoading: true
    });
    expect(state.player.play).toHaveBeenCalled();
  });

  it('ignores non-object commands', () => {
    state.api.send.mockClear();
    command(null);
    command('load');
    command(42);
    expect(state.api.send).not.toHaveBeenCalled();
  });
});

describe('commands', () => {
  it('loads tracks with queue and autoplay options', () => {
    const track = makeTrack('a');
    const queue = [makeTrack('b')];
    command({ type: 'load', track, queue, pendingQueue: [], resume: true });

    expect(state.player.queue).toEqual(queue);
    expect(state.player.pendingQueue).toEqual([]);
    expect(state.player.setTrack).toHaveBeenCalledWith(track, { resume: true });
    expect(state.player.play).toHaveBeenCalled();

    state.player.play.mockClear();
    command({ type: 'load', track, autoplay: false });
    expect(state.player.play).not.toHaveBeenCalled();
  });

  it('ignores load commands without a valid path', () => {
    command({ type: 'load' });
    command({ type: 'load', track: {} });
    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(sends('core:state')).toHaveLength(0);
  });

  it('rejects image tracks and recovers on the next command', () => {
    command({ type: 'load', track: makeTrack('pic', { type: 'image' }) });

    expect(sends('core:error').at(-1)).toContain('Core supports audio/video only');
    expect(sends('core:tick').at(-1)).toMatchObject({
      error: expect.stringContaining('Core supports audio/video only')
    });

    command({ type: 'pause' });
    expect(state.player.pause).toHaveBeenCalled();
  });

  it('replaces queues and handles transport commands', () => {
    const queue = [makeTrack('a')];
    command({ type: 'setQueue', queue });
    expect(state.player.queue).toEqual(queue);
    expect(state.player.pendingQueue).toEqual([]);

    command({ type: 'setQueue', queue, pendingQueue: [makeTrack('b')] });
    expect(state.player.pendingQueue).toHaveLength(1);

    command({ type: 'play' });
    command({ type: 'pause' });
    command({ type: 'toggle' });
    command({ type: 'next' });
    command({ type: 'prev' });
    command({ type: 'clear' });

    expect(state.player.play).toHaveBeenCalled();
    expect(state.player.pause).toHaveBeenCalled();
    expect(state.player.togglePlay).toHaveBeenCalled();
    expect(state.player.nextTrack).toHaveBeenCalled();
    expect(state.player.prevTrack).toHaveBeenCalled();
    expect(state.player.clearTrack).toHaveBeenCalled();
  });

  it('clamps seek and volume values', () => {
    command({ type: 'seek', time: 15 });
    expect(state.player.seek).toHaveBeenCalledWith(15);
    expect(state.audio.seek).toHaveBeenCalledWith(15);

    command({ type: 'seek', time: -5 });
    expect(state.player.seek).toHaveBeenLastCalledWith(0);

    command({ type: 'seek', time: 'nope' });
    expect(state.player.seek).toHaveBeenLastCalledWith(0);

    command({ type: 'setVolume', value: 1.7 });
    expect(state.audio.setVolume).toHaveBeenLastCalledWith(1);

    command({ type: 'setVolume', value: -2 });
    expect(state.audio.setVolume).toHaveBeenLastCalledWith(0);

    command({ type: 'setVolume', value: 'x' });
    expect(state.audio.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('handles mute, shuffle, repeat and history commands', () => {
    command({ type: 'toggleMute' });
    command({ type: 'toggleShuffle' });
    command({ type: 'cycleRepeat' });
    command({ type: 'playFromHistory', index: 3 });
    command({ type: 'playFromHistory' });

    expect(state.player.toggleMute).toHaveBeenCalled();
    expect(state.player.toggleShuffle).toHaveBeenCalled();
    expect(state.player.cycleRepeat).toHaveBeenCalled();
    expect(state.player.playFromHistory).toHaveBeenCalledWith(3);
    expect(state.player.playFromHistory).toHaveBeenLastCalledWith(0);
  });

  it('tracks PiP state and falls back to the current time', () => {
    command({ type: 'setPip', active: true, time: 10 });
    expect(state.player.pipActive).toBe(true);
    expect(state.player.pipTime).toBe(10);

    command({ type: 'setPip', active: false });
    expect(state.player.pipActive).toBe(false);
    expect(state.player.pipTime).toBe(42);
  });

  it('applies every equalizer command', () => {
    command({ type: 'eqBands', bands: [1, 2] });
    command({ type: 'eqEnabled', enabled: true });
    command({ type: 'eqPreamp', db: 3 });
    command({ type: 'eqPreamp' });
    command({ type: 'eqMono', on: true });
    command({ type: 'nightMode', on: true });
    command({ type: 'audioDelay', ms: -20 });
    command({ type: 'applyEqGraph', bands: [0, 1] });

    expect(state.audio.applyEqBands).toHaveBeenCalledWith([1, 2]);
    expect(state.audio.setEqEnabled).toHaveBeenCalledWith(true);
    expect(state.audio.setEqPreamp).toHaveBeenCalledWith(3);
    expect(state.audio.setEqPreamp).toHaveBeenLastCalledWith(0);
    expect(state.audio.setEqMono).toHaveBeenCalledWith(true);
    expect(state.audio.setNightMode).toHaveBeenCalledWith(true);
    expect(state.audio.setAudioDelay).toHaveBeenCalledWith(-20);
    expect(state.audio.applyEqGraph).toHaveBeenCalledWith([0, 1]);
  });

  it('ignores unknown commands but still publishes state', () => {
    command({ type: 'unknown' });
    expect(sends('core:state')).toHaveLength(1);
  });
});

describe('visualizer', () => {
  it('streams downsampled frequency bins while playing', () => {
    const raw = new Uint8Array(256);
    for (let i = 0; i < raw.length; i += 1) raw[i] = i;
    const analyser = {
      frequencyBinCount: 256,
      getByteFrequencyData: (target: Uint8Array) => target.set(raw)
    };
    state.audio.getAnalyserNode.mockReturnValue(analyser);
    state.audio.isPlaying.value = true;

    command({ type: 'viz', active: true });
    const vizTimer = timer(33);
    vizTimer.cb();

    const bins = sends('core:viz').at(-1) as number[];
    expect(bins).toHaveLength(256);
    expect(bins[0]).toBe(0);
    expect(bins[5]).toBe(5);
    expect(bins[255]).toBe(255);
  });

  it('starts only one viz timer and stops it on demand', () => {
    command({ type: 'viz', active: true });
    command({ type: 'viz', active: true });
    expect(state.intervals.filter((entry) => entry.ms === 33)).toHaveLength(1);

    const id = timer(33).id;
    command({ type: 'viz', active: false });
    expect(state.clearCalls).toContain(id);
    expect(state.intervals.some((entry) => entry.ms === 33)).toBe(false);
  });

  it('skips work while paused or without an analyser', () => {
    command({ type: 'viz', active: true });
    const vizTimer = timer(33);

    state.audio.isPlaying.value = false;
    vizTimer.cb();
    expect(sends('core:viz')).toHaveLength(0);

    state.audio.isPlaying.value = true;
    vizTimer.cb();
    expect(sends('core:viz')).toHaveLength(0);
  });
});
