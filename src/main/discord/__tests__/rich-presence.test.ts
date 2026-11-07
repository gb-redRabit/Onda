import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  connect: vi.fn(),
  build: vi.fn(),
  loggerInfo: vi.fn(),
  connections: [] as any[],
  activity: { details: 'Song' } as any
}));

vi.mock('../discord-ipc', () => ({ connectDiscord: state.connect }));
vi.mock('../presence-activity', () => ({ buildActivity: state.build }));

vi.mock('../../../shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));

function makeConnection() {
  const conn = {
    setActivity: vi.fn(),
    clearActivity: vi.fn(),
    close: vi.fn(),
    onClose: undefined as (() => void) | undefined
  };
  return conn;
}

async function load() {
  vi.resetModules();
  return import('../rich-presence');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

const presence = (overrides: Record<string, unknown> = {}) =>
  ({
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    kind: 'audio',
    isPlaying: true,
    positionSec: 0,
    ...overrides
  }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  state.connect.mockReset();
  state.build.mockReset();
  state.loggerInfo.mockReset();
  state.connections = [];
  state.activity = { details: 'Song' };
  state.build.mockImplementation(() => state.activity);
  state.connect.mockImplementation(async () => {
    const conn = makeConnection();
    state.connections.push(conn);
    return conn;
  });
});

describe('configureDiscord', () => {
  it('connects for a valid enabled client id', async () => {
    const { configureDiscord, getDiscordStatus } = await load();
    configureDiscord({ enabled: true, clientId: ' 1234567890 ' });
    await flush();

    expect(state.connect).toHaveBeenCalledWith('1234567890');
    expect(getDiscordStatus()).toEqual({ enabled: true, connected: true, error: null });
  });

  it('ignores malformed options and invalid client ids', async () => {
    const { configureDiscord, getDiscordStatus } = await load();

    configureDiscord(null);
    configureDiscord('text');
    configureDiscord([]);
    configureDiscord({ enabled: true, clientId: 'abc' });
    configureDiscord({ enabled: false, clientId: '1234567890' });
    await flush();

    expect(state.connect).not.toHaveBeenCalled();
    expect(getDiscordStatus()).toEqual({ enabled: false, connected: false, error: null });
  });

  it('does not reconnect for unchanged configuration', async () => {
    const { configureDiscord } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    expect(state.connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when disabled', async () => {
    const { configureDiscord, getDiscordStatus } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    const conn = state.connections[0];

    configureDiscord({ enabled: false, clientId: '1234567890' });
    expect(conn.close).toHaveBeenCalled();
    expect(conn.onClose).toBeUndefined();
    expect(getDiscordStatus()).toEqual({ enabled: false, connected: false, error: null });
  });

  it('replays the last presence after connecting', async () => {
    const { configureDiscord, updatePresence } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    updatePresence(presence());
    await flush();
    await vi.advanceTimersByTimeAsync(5000);

    expect(state.connections[0].setActivity).toHaveBeenCalled();
  });

  it('records connect failures and retries', async () => {
    state.connect.mockRejectedValueOnce(new Error('discord missing'));
    const { configureDiscord, getDiscordStatus } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();

    expect(getDiscordStatus()).toEqual({
      enabled: true,
      connected: false,
      error: 'discord missing'
    });
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'discord',
      'rich presence connect failed: discord missing'
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(state.connect).toHaveBeenCalledTimes(2);
  });
});

describe('updatePresence', () => {
  it('ignores updates while disabled', async () => {
    const { updatePresence } = await load();
    updatePresence(presence());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it('sends an activity and deduplicates identical fingerprints', async () => {
    const { configureDiscord, updatePresence } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    updatePresence(presence());
    await vi.advanceTimersByTimeAsync(5000);

    const conn = state.connections[0];
    expect(conn.setActivity).toHaveBeenCalledWith(state.activity);

    conn.setActivity.mockClear();
    updatePresence(presence());
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.setActivity).not.toHaveBeenCalled();

    updatePresence(presence({ title: 'Other' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.setActivity).toHaveBeenCalled();
  });

  it('invalidates dedupe for cover and position bucket changes', async () => {
    const { configureDiscord, updatePresence } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    const conn = state.connections[0];

    updatePresence(presence());
    await vi.advanceTimersByTimeAsync(5000);
    conn.setActivity.mockClear();

    updatePresence(presence({ coverUrl: 'https://cover' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.setActivity).toHaveBeenCalledTimes(1);

    conn.setActivity.mockClear();
    updatePresence(presence({ coverUrl: 'https://cover', positionSec: 12 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.setActivity).toHaveBeenCalledTimes(1);

    conn.setActivity.mockClear();
    updatePresence(presence({ coverUrl: 'https://cover', positionSec: 19 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.setActivity).not.toHaveBeenCalled();
  });

  it('clears activity once when there is nothing to show', async () => {
    state.activity = null;
    const { configureDiscord, updatePresence } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    updatePresence(null);
    await vi.advanceTimersByTimeAsync(5000);

    const conn = state.connections[0];
    expect(conn.clearActivity).toHaveBeenCalledTimes(1);

    updatePresence(null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.clearActivity).toHaveBeenCalledTimes(1);
  });

  it('throttles rapid updates and sends the latest activity', async () => {
    const { configureDiscord, updatePresence } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    const conn = state.connections[0];

    updatePresence(presence({ title: 'First' }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(conn.setActivity).toHaveBeenCalledTimes(1);

    state.activity = { details: 'Second' };
    updatePresence(presence({ title: 'Second' }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(conn.setActivity).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(conn.setActivity).toHaveBeenCalledTimes(2);
    expect(conn.setActivity).toHaveBeenLastCalledWith({ details: 'Second' });

    await vi.advanceTimersByTimeAsync(1000);
    state.activity = { details: 'Final' };
    updatePresence(presence({ title: 'Final' }));
    await vi.advanceTimersByTimeAsync(3999);
    expect(conn.setActivity).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(conn.setActivity).toHaveBeenCalledTimes(3);
    expect(conn.setActivity).toHaveBeenLastCalledWith({ details: 'Final' });
  });

  it('does not send when the connection cannot be established', async () => {
    state.connect.mockRejectedValue(new Error('nope'));
    const { configureDiscord, updatePresence } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    updatePresence(presence());
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.connect).toHaveBeenCalled();
  });
});

describe('reconnection and shutdown', () => {
  it('schedules a reconnect when the socket closes', async () => {
    const { configureDiscord, updatePresence, getDiscordStatus } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    updatePresence(presence());
    await flush();
    await vi.advanceTimersByTimeAsync(5000);

    const conn = state.connections[0];
    conn.onClose?.();
    expect(getDiscordStatus().connected).toBe(false);

    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(state.connect).toHaveBeenCalledTimes(2);
  });

  it('does not schedule duplicate reconnects', async () => {
    state.connect.mockRejectedValue(new Error('down'));
    const { configureDiscord } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(state.connect).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(state.connect).toHaveBeenCalledTimes(3);
  });

  it('shuts down cleanly and ignores later updates', async () => {
    const { configureDiscord, updatePresence, shutdownDiscord, getDiscordStatus } = await load();
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await flush();
    const conn = state.connections[0];

    shutdownDiscord();
    expect(conn.close).toHaveBeenCalled();
    expect(getDiscordStatus()).toEqual({ enabled: false, connected: false, error: null });

    state.connect.mockClear();
    updatePresence(presence());
    configureDiscord({ enabled: true, clientId: '1234567890' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.connect).not.toHaveBeenCalled();
  });
});
