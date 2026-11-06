import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Spike ukrytego Core: sprawdzamy routing IPC, odtwarzanie stanu po crashu,
// limit restartów i watchdog gotowości. Okna i fs są podstawione.
const state = vi.hoisted(() => ({
  created: [] as any[],
  listeners: new Map<string, (...args: any[]) => any>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  removedHandlers: [] as string[],
  removedListeners: [] as string[],
  appOnce: vi.fn(),
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  addAllowedRoot: vi.fn(async () => true),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  nextWindowId: 1,
  shell: null as any
}));

vi.mock('electron', () => ({
  app: { once: (event: string, handler: () => void) => state.appOnce(event, handler) },
  BrowserWindow: {},
  ipcMain: {
    on: (channel: string, handler: (...args: any[]) => any) => {
      state.listeners.set(channel, handler);
    },
    handle: (channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      state.removedHandlers.push(channel);
      state.handlers.delete(channel);
    },
    removeAllListeners: (channel: string) => {
      state.removedListeners.push(channel);
      state.listeners.delete(channel);
    }
  }
}));
vi.mock('fs/promises', () => ({ mkdir: state.mkdir, writeFile: state.writeFile }));
vi.mock('../../../shared/logger', () => ({ logger: state.logger }));
vi.mock('../../media/media-server', () => ({ addAllowedRoot: state.addAllowedRoot }));
vi.mock('../../windows/window-factory', () => ({
  createWindow: (options: Record<string, unknown>) => {
    const webContents = new EventEmitter() as EventEmitter & {
      id: number;
      send: ReturnType<typeof vi.fn>;
      reload: ReturnType<typeof vi.fn>;
    };
    webContents.id = state.nextWindowId++;
    webContents.send = vi.fn();
    webContents.reload = vi.fn();
    const win = Object.assign(new EventEmitter(), {
      options,
      destroyed: false,
      webContents,
      isDestroyed: vi.fn(() => win.destroyed),
      destroy: vi.fn(() => {
        win.destroyed = true;
      })
    });
    state.created.push(win);
    return win;
  }
}));

const { startCoreService, stopCoreService } = await import('../core-spike');

function listener(channel: string): (...args: any[]) => any {
  const found = state.listeners.get(channel);
  if (!found) throw new Error(`${channel} was not registered`);
  return found;
}

function coreWindow(): any {
  return state.created[0];
}

function eventFor(win: any): { sender: { id: number } } {
  return { sender: { id: win.webContents.id } };
}

function coreCommands(win: any): unknown[] {
  return win.webContents.send.mock.calls
    .filter((call: unknown[]) => call[0] === 'core:command')
    .map((call: unknown[]) => call[1]);
}

const track = { id: '/music/song.mp3', name: 'Song', path: '/music/song.mp3' } as never;

function fullState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    revision: 1,
    current: track,
    queue: [],
    pendingQueue: [],
    currentTime: 12,
    volume: 0.5,
    isMuted: true,
    shuffle: true,
    repeat: 'all',
    pipActive: true,
    pipTime: 3,
    isPlaying: true,
    ...overrides
  };
}

function start(options: Record<string, unknown> = {}): void {
  startCoreService({ testShell: false, ...options } as never);
}

beforeEach(() => {
  vi.useFakeTimers();
  state.created = [];
  state.listeners.clear();
  state.handlers.clear();
  state.removedHandlers = [];
  state.removedListeners = [];
  state.appOnce.mockClear();
  state.mkdir.mockClear();
  state.writeFile.mockClear();
  state.addAllowedRoot.mockClear();
  state.logger.info.mockClear();
  state.logger.warn.mockClear();
  state.logger.error.mockClear();
  state.nextWindowId = 1;
  state.shell = null;
  stopCoreService();
  delete process.env.ONDA_CORE_SPIKE;
  delete process.env.ONDA_CORE_SPIKE_AUTOPLAY;
  delete process.env.ONDA_CORE_SHELL_AUTOPLAY;
});

afterEach(() => {
  stopCoreService();
  vi.useRealTimers();
});

describe('start and stop', () => {
  it('creates a hidden Core window and registers IPC once', () => {
    start();

    expect(coreWindow().options).toMatchObject({
      width: 200,
      height: 120,
      show: false,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      htmlFile: 'core.html',
      autoShow: false,
      webPreferences: {
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    expect(state.appOnce).toHaveBeenCalledWith('before-quit', stopCoreService);
    expect([...state.listeners.keys()]).toEqual(
      expect.arrayContaining([
        'core:command',
        'core:ready',
        'core:error',
        'core:state',
        'core:tick',
        'core:viz'
      ])
    );
    expect(state.handlers.has('core:getState')).toBe(true);

    const first = state.created.length;
    start();
    expect(state.created).toHaveLength(first);
  });

  it('creates a test shell when requested and prefers it for state', () => {
    start({ testShell: true });

    expect(state.created).toHaveLength(2);
    expect(state.created[1].options).toMatchObject({
      htmlFile: 'core-test.html',
      autoShow: true
    });

    listener('core:state')(eventFor(coreWindow()), fullState());
    expect(state.created[1].webContents.send).toHaveBeenCalledWith(
      'core:state',
      expect.objectContaining({ revision: 1 })
    );
  });

  it('stops timers, IPC and windows, then can start again', () => {
    start();
    stopCoreService();

    expect(coreWindow().destroy).toHaveBeenCalled();
    expect(state.removedHandlers).toContain('core:getState');
    expect(state.removedListeners).toEqual(
      expect.arrayContaining([
        'core:command',
        'core:ready',
        'core:error',
        'core:state',
        'core:tick',
        'core:viz'
      ])
    );

    const before = state.created.length;
    start();
    expect(state.created.length).toBe(before + 1);
  });
});

describe('IPC routing', () => {
  beforeEach(() => {
    state.shell = {
      isDestroyed: () => false,
      webContents: { id: 99, send: vi.fn() }
    };
    start({ getShellWindow: () => state.shell });
  });

  it('forwards commands only from the shell to Core', () => {
    const core = coreWindow();
    const command = { type: 'play' };

    listener('core:command')({ sender: { id: 99 } }, command);
    expect(core.webContents.send).toHaveBeenCalledWith('core:command', command);

    core.webContents.send.mockClear();
    listener('core:command')({ sender: { id: 1234 } }, command);
    expect(core.webContents.send).not.toHaveBeenCalled();
  });

  it('accepts state, tick and viz only from Core', () => {
    const core = coreWindow();
    const shellSend = state.shell.webContents.send;

    listener('core:state')({ sender: { id: 5 } }, fullState());
    expect(shellSend).not.toHaveBeenCalled();

    listener('core:state')(eventFor(core), fullState());
    expect(shellSend).toHaveBeenCalledWith('core:state', expect.objectContaining({ revision: 1 }));

    listener('core:tick')(eventFor(core), { revision: 2, currentTime: 1, duration: 2 });
    expect(shellSend).toHaveBeenCalledWith('core:tick', expect.objectContaining({ revision: 2 }));

    listener('core:viz')(eventFor(core), [1, 2, 3]);
    expect(shellSend).toHaveBeenCalledWith('core:viz', [1, 2, 3]);

    // Nieprawidłowe payloady nie zmieniają cache.
    listener('core:state')(eventFor(core), null);
    listener('core:tick')(eventFor(core), 'not-an-object');
    expect(state.handlers.get('core:getState')!()).toMatchObject({ revision: 2 });
  });

  it('merges the last full state with the latest tick', () => {
    const core = coreWindow();
    expect(state.handlers.get('core:getState')!()).toBeNull();

    listener('core:state')(eventFor(core), fullState());
    expect(state.handlers.get('core:getState')!()).toMatchObject({ revision: 1, currentTime: 12 });

    listener('core:tick')(eventFor(core), { revision: 2, currentTime: 33, duration: 100 });
    expect(state.handlers.get('core:getState')!()).toMatchObject({
      revision: 2,
      currentTime: 33,
      duration: 100,
      volume: 0.5
    });
  });

  it('forwards core errors but ignores frames that are not Core', () => {
    const shellSend = state.shell.webContents.send;

    listener('core:error')({ sender: { id: 5 } }, 'nope');
    expect(shellSend).not.toHaveBeenCalled();

    listener('core:error')(eventFor(coreWindow()), 'decoder failed');
    expect(shellSend).toHaveBeenCalledWith('core:error', 'decoder failed');
  });

  it('signals readiness and ignores ready from other frames', () => {
    const shellSend = state.shell.webContents.send;

    listener('core:ready')({ sender: { id: 5 } });
    expect(shellSend).not.toHaveBeenCalled();

    listener('core:ready')(eventFor(coreWindow()));
    expect(shellSend).toHaveBeenCalledWith('core:ready', true);
  });

  it('prepares and sends an autoplay tone once when enabled', async () => {
    stopCoreService();
    state.created = [];
    process.env.ONDA_CORE_SPIKE_AUTOPLAY = '1';
    start();

    listener('core:ready')(eventFor(coreWindow()));

    await vi.advanceTimersByTimeAsync(0);
    const commands = coreCommands(coreWindow());
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: 'load',
      autoplay: true,
      track: expect.objectContaining({ extension: 'wav', type: 'audio' })
    });
    expect(state.addAllowedRoot).toHaveBeenCalled();

    // Kolejne ready nie powtarza autoplay.
    listener('core:ready')(eventFor(coreWindow()));
    await Promise.resolve();
    expect(coreCommands(coreWindow())).toHaveLength(1);
  });
});

describe('crash recovery', () => {
  beforeEach(() => {
    state.shell = {
      isDestroyed: () => false,
      webContents: { id: 99, send: vi.fn() }
    };
    start({ getShellWindow: () => state.shell });
  });

  it('reloads Core after a render-process-gone and restores the last state', () => {
    const core = coreWindow();
    listener('core:state')(eventFor(core), fullState());
    listener('core:tick')(eventFor(core), { revision: 2, currentTime: 20 });

    core.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(state.shell.webContents.send).toHaveBeenCalledWith(
      'core:error',
      'Core restarting: render process gone: crashed'
    );

    vi.advanceTimersByTime(400);
    expect(core.webContents.reload).toHaveBeenCalled();

    core.webContents.send.mockClear();
    listener('core:ready')(eventFor(core));

    expect(coreCommands(core)).toEqual([
      {
        type: 'load',
        track,
        autoplay: false,
        resume: false,
        queue: [],
        pendingQueue: []
      },
      { type: 'seek', time: 20 },
      { type: 'setVolume', value: 0.5 },
      { type: 'toggleMute' },
      { type: 'toggleShuffle' },
      { type: 'cycleRepeat' },
      { type: 'cycleRepeat' },
      { type: 'setPip', active: true, time: 3 },
      { type: 'play' }
    ]);

    // Stan nie jest odtwarzany drugi raz.
    core.webContents.send.mockClear();
    listener('core:ready')(eventFor(core));
    expect(coreCommands(core)).toEqual([]);
  });

  it('sends a clear command when a crash happens without a track', () => {
    const core = coreWindow();
    listener('core:state')(eventFor(core), fullState({ current: null }));

    core.webContents.emit('render-process-gone', {}, { reason: 'oom' });
    vi.advanceTimersByTime(400);
    listener('core:ready')(eventFor(core));

    expect(coreCommands(core)[0]).toEqual({ type: 'clear' });
  });

  it('gives up after too many crashes inside the window', () => {
    const core = coreWindow();
    const shellSend = state.shell.webContents.send;

    for (let i = 0; i < 4; i += 1) {
      core.webContents.emit('render-process-gone', {}, { reason: 'crash' });
      vi.advanceTimersByTime(1000 * 5);
      if (i < 3) listener('core:ready')(eventFor(core));
    }

    expect(shellSend).toHaveBeenCalledWith(
      'core:error',
      expect.stringContaining('Core crashed repeatedly')
    );
    expect(state.logger.error).toHaveBeenCalledWith(
      'core-service',
      expect.stringContaining('giving up')
    );
  });

  it('retries when Core never becomes ready after a restart', () => {
    const core = coreWindow();
    core.webContents.emit('render-process-gone', {}, { reason: 'crash' });

    vi.advanceTimersByTime(400);
    expect(core.webContents.reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(800);
    expect(core.webContents.reload).toHaveBeenCalledTimes(2);
  });

  it('restarts when the Core window closes while started', () => {
    const core = coreWindow();
    const before = state.created.length;
    core.emit('closed');

    vi.advanceTimersByTime(400);
    expect(state.created.length).toBe(before + 1);
    expect(state.created.at(-1)).not.toBe(core);
  });

  it('does not restart after shutdown', () => {
    const core = coreWindow();
    stopCoreService();
    core.webContents.emit('render-process-gone', {}, { reason: 'crash' });
    vi.advanceTimersByTime(10_000);
    expect(core.webContents.reload).not.toHaveBeenCalled();
  });
});
