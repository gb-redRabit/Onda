import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import type { Router } from 'vue-router';

// Sesja: localStorage jest prawdziwy (jsdom), store i nawigacja są podstawione.
const state = vi.hoisted(() => {
  const player = {
    currentTrack: { path: '/music/a.mp3' } as { path: string } | null,
    queue: [{ path: '/music/a.mp3' }],
    pendingQueue: [{ path: '/music/b.mp3' }],
    queueLength: 1,
    isPlaying: true,
    shuffle: false,
    repeat: 'none' as 'none' | 'all' | 'one',
    volume: 1,
    isMuted: false,
    setVolume: vi.fn((value: number) => {
      player.volume = value;
    }),
    toggleShuffle: vi.fn(() => {
      player.shuffle = !player.shuffle;
    }),
    cycleRepeat: vi.fn(() => {
      player.repeat = player.repeat === 'none' ? 'all' : player.repeat === 'all' ? 'one' : 'none';
    }),
    toggleMute: vi.fn(() => {
      player.isMuted = !player.isMuted;
    }),
    play: vi.fn(),
    pause: vi.fn(),
    clearQueue: vi.fn(() => {
      player.queue = [];
      player.queueLength = 0;
    }),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn()
  };
  return {
    player,
    buildMediaFile: vi.fn((input: { path: string }) => ({
      path: input.path,
      type: input.path.endsWith('.mp4') ? 'video' : 'audio'
    })),
    openMediaFiles: vi.fn(),
    invoke: vi.fn(),
    grantMediaAccess: vi.fn(async () => true)
  };
});

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/utils/explorerMedia', () => ({ buildMediaFile: state.buildMediaFile }));
vi.mock('../useOpenMedia', () => ({ openMediaFiles: state.openMediaFiles }));

const {
  clearPersistedSession,
  persistSessionNow,
  prepareSessionForRestart,
  readPersistedSession,
  restoreSessionToPlayer,
  useSessionPersistence
} = await import('../useSessionPersistence');

const SESSION_KEY = 'onda-session';

function resetPlayer(): void {
  state.player.currentTrack = { path: '/music/a.mp3' };
  state.player.queue = [{ path: '/music/a.mp3' }];
  state.player.pendingQueue = [{ path: '/music/b.mp3' }];
  state.player.queueLength = 1;
  state.player.isPlaying = true;
  state.player.shuffle = false;
  state.player.repeat = 'none';
  state.player.volume = 1;
  state.player.isMuted = false;
  for (const key of [
    'setVolume',
    'toggleShuffle',
    'cycleRepeat',
    'toggleMute',
    'play',
    'pause',
    'clearQueue',
    'addToQueueMultiple',
    'setTrack'
  ] as const) {
    (state.player[key] as ReturnType<typeof vi.fn>).mockClear();
  }
}

function storeSession(value: unknown): void {
  localStorage.setItem(SESSION_KEY, typeof value === 'string' ? value : JSON.stringify(value));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPlayer();
  state.buildMediaFile.mockImplementation((input: { path: string }) => ({
    path: input.path,
    type: input.path.endsWith('.mp4') ? 'video' : 'audio'
  }));
  state.openMediaFiles.mockReset();
  state.openMediaFiles.mockResolvedValue(undefined);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.grantMediaAccess.mockReset();
  state.grantMediaAccess.mockResolvedValue(true);
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    grantMediaAccess: state.grantMediaAccess
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as { api?: unknown }).api;
});

describe('readPersistedSession', () => {
  it('returns null without a session or with broken JSON', () => {
    expect(readPersistedSession()).toBeNull();
    storeSession('not json');
    expect(readPersistedSession()).toBeNull();
    storeSession({ queue: [] });
    expect(readPersistedSession()).toBeNull();
    storeSession({ currentPath: '' });
    expect(readPersistedSession()).toBeNull();
  });

  it('normalizes valid data', () => {
    storeSession({
      currentPath: '/music/a.mp3',
      queue: ['/music/a.mp3', 42, '/music/b.mp3'],
      isPlaying: false,
      shuffle: true,
      repeat: 'all',
      volume: 1.5,
      isMuted: true
    });

    expect(readPersistedSession()).toEqual({
      currentPath: '/music/a.mp3',
      queue: ['/music/a.mp3', '/music/b.mp3'],
      isPlaying: false,
      shuffle: true,
      repeat: 'all',
      volume: 1,
      isMuted: true
    });
  });

  it('drops non-finite volume and invalid repeat', () => {
    storeSession({ currentPath: '/a.mp3', repeat: 'sometimes', volume: Number.NaN });
    expect(readPersistedSession()).toEqual({ currentPath: '/a.mp3', queue: [] });
  });

  it('clamps negative volume', () => {
    storeSession({ currentPath: '/a.mp3', volume: -2 });
    expect(readPersistedSession()).toMatchObject({ volume: 0 });
  });

  it('swallows storage errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readPersistedSession()).toBeNull();
    spy.mockRestore();
  });
});

describe('write and clear', () => {
  it('persists the current track, queue and playback state', () => {
    persistSessionNow();

    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({
      currentPath: '/music/a.mp3',
      queue: ['/music/a.mp3', '/music/b.mp3'],
      isPlaying: true,
      shuffle: false,
      repeat: 'none',
      volume: 1,
      isMuted: false
    });
  });

  it('caps the persisted queue at 500 entries', () => {
    state.player.queue = Array.from({ length: 600 }, (_, i) => ({ path: `/q/${i}.mp3` }));
    state.player.pendingQueue = [];
    persistSessionNow();

    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).queue).toHaveLength(500);
  });

  it('clears the session when there is no track', () => {
    storeSession({ currentPath: '/old.mp3', queue: [] });
    state.player.currentTrack = null;

    persistSessionNow();

    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clears explicitly and swallows storage errors', () => {
    storeSession({ currentPath: '/a.mp3', queue: [] });
    clearPersistedSession();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => clearPersistedSession()).not.toThrow();
    spy.mockRestore();
  });

  it('prepares a restart by persisting immediately', () => {
    prepareSessionForRestart();
    expect(localStorage.getItem(SESSION_KEY)).toContain('/music/a.mp3');
  });

  it('swallows write errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => persistSessionNow()).not.toThrow();
    spy.mockRestore();
  });
});

describe('restoreSessionToPlayer', () => {
  it('returns false without a session', async () => {
    await expect(restoreSessionToPlayer()).resolves.toBe(false);
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('restores existing audio tracks and playback state', async () => {
    storeSession({
      currentPath: '/music/a.mp3',
      queue: ['/music/a.mp3', '/music/b.mp3'],
      volume: 0.4,
      shuffle: true,
      repeat: 'one',
      isMuted: true,
      isPlaying: false
    });
    state.invoke.mockResolvedValue(['/music/a.mp3', '/music/b.mp3']);

    await expect(restoreSessionToPlayer()).resolves.toBe(true);

    expect(state.invoke).toHaveBeenCalledWith('fs:existing', [
      '/music/a.mp3',
      '/music/a.mp3',
      '/music/b.mp3'
    ]);
    expect(state.grantMediaAccess).toHaveBeenCalledTimes(2);
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      { path: '/music/b.mp3', type: 'audio' }
    ]);
    expect(state.player.setTrack).toHaveBeenCalledWith(
      { path: '/music/a.mp3', type: 'audio' },
      { resume: true }
    );
    expect(state.player.setVolume).toHaveBeenCalledWith(0.4);
    expect(state.player.toggleShuffle).toHaveBeenCalled();
    expect(state.player.repeat).toBe('one');
    expect(state.player.toggleMute).toHaveBeenCalled();
    expect(state.player.pause).toHaveBeenCalled();
    expect(state.player.play).not.toHaveBeenCalled();
  });

  it('applies play and skips matching state', async () => {
    storeSession({
      currentPath: '/music/a.mp3',
      queue: [],
      volume: 1,
      shuffle: false,
      repeat: 'none',
      isMuted: false,
      isPlaying: true
    });
    state.invoke.mockResolvedValue(['/music/a.mp3']);

    await restoreSessionToPlayer();

    expect(state.player.play).toHaveBeenCalled();
    expect(state.player.toggleShuffle).not.toHaveBeenCalled();
    expect(state.player.toggleMute).not.toHaveBeenCalled();
    expect(state.player.cycleRepeat).not.toHaveBeenCalled();
  });

  it('falls back to the original paths when fs:existing fails', async () => {
    storeSession({ currentPath: '/music/a.mp3', queue: [] });
    state.invoke.mockRejectedValue(new Error('ipc down'));

    await expect(restoreSessionToPlayer()).resolves.toBe(true);
    expect(state.player.setTrack).toHaveBeenCalled();
  });

  it('clears the session when nothing exists anymore', async () => {
    storeSession({ currentPath: '/music/gone.mp3', queue: [] });
    state.invoke.mockResolvedValue([]);

    await expect(restoreSessionToPlayer()).resolves.toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('rejects a session with only video tracks', async () => {
    storeSession({ currentPath: '/video/a.mp4', queue: ['/video/b.mp4'] });
    state.invoke.mockResolvedValue(['/video/a.mp4', '/video/b.mp4']);

    await expect(restoreSessionToPlayer()).resolves.toBe(false);
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });
});

describe('useSessionPersistence', () => {
  function create() {
    const scope = effectScope();
    let api!: ReturnType<typeof useSessionPersistence>;
    scope.run(() => {
      api = useSessionPersistence();
    });
    return { api, scope };
  }

  it('debounces saves for one second', () => {
    const { api, scope } = create();

    api.scheduleSave();
    vadvance(999);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    vadvance(1);
    expect(localStorage.getItem(SESSION_KEY)).toContain('/music/a.mp3');
    scope.stop();
  });

  it('restarts the debounce on every call', () => {
    const { api, scope } = create();

    api.scheduleSave();
    vadvance(900);
    api.scheduleSave();
    vadvance(200);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    vadvance(800);
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    scope.stop();
  });

  it('clears a pending save when the scope is disposed', () => {
    const { api, scope } = create();
    api.scheduleSave();
    scope.stop();
    vadvance(2000);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('persists immediately on demand', () => {
    const { api, scope } = create();
    api.persistNow();
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    scope.stop();
  });

  it('delegates restore to the router and applies state', async () => {
    storeSession({ currentPath: '/music/a.mp3', queue: [], isPlaying: true });
    state.invoke.mockResolvedValue(['/music/a.mp3']);
    const router = { push: vi.fn() } as unknown as Router;
    const { api, scope } = create();

    await expect(api.restore(router)).resolves.toBe(true);

    expect(state.openMediaFiles).toHaveBeenCalledWith(['/music/a.mp3'], router);
    expect(state.player.play).toHaveBeenCalled();
    scope.stop();
  });

  it('returns false when navigation fails', async () => {
    storeSession({ currentPath: '/music/a.mp3', queue: [] });
    state.invoke.mockResolvedValue(['/music/a.mp3']);
    state.openMediaFiles.mockRejectedValue(new Error('route failed'));
    const { api, scope } = create();

    await expect(api.restore({} as Router)).resolves.toBe(false);
    scope.stop();
  });

  it('returns false when there is no session', async () => {
    const { api, scope } = create();
    await expect(api.restore({} as Router)).resolves.toBe(false);
    expect(state.openMediaFiles).not.toHaveBeenCalled();
    scope.stop();
  });
});

function vadvance(ms: number): void {
  vi.advanceTimersByTime(ms);
}
