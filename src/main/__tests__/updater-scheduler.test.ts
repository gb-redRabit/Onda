import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getStore: vi.fn(),
  store: { get: vi.fn() },
  checkForUpdates: vi.fn(),
  getUpdaterState: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  updates: {} as Record<string, unknown>
}));

vi.mock('../ipc/cover/cover-cache', () => ({ getStore: h.getStore }));
vi.mock('../updater', () => ({
  checkForUpdates: h.checkForUpdates,
  getUpdaterState: h.getUpdaterState
}));
vi.mock('../../shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: h.loggerWarn, error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../updater-scheduler');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.updates = {};
  h.getUpdaterState.mockReset();
  h.getUpdaterState.mockReturnValue({ enabled: true });
  h.getStore.mockReset();
  h.getStore.mockResolvedValue(h.store);
  h.store.get.mockReset();
  h.store.get.mockImplementation((key: string) => (key === 'updates' ? h.updates : undefined));
  h.checkForUpdates.mockReset();
  h.checkForUpdates.mockResolvedValue(undefined);
  h.loggerInfo.mockReset();
  h.loggerWarn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('configureAutoCheck', () => {
  it('does nothing when the updater is disabled', async () => {
    h.getUpdaterState.mockReturnValue({ enabled: false });
    const scheduler = await load();

    await scheduler.configureAutoCheck();

    expect(h.getStore).not.toHaveBeenCalled();
  });

  it('does nothing when auto-check is off', async () => {
    h.updates = { autoCheck: false, checkInterval: 'daily' };
    const scheduler = await load();

    await scheduler.configureAutoCheck();

    expect(h.loggerInfo).not.toHaveBeenCalled();
    expect(h.checkForUpdates).not.toHaveBeenCalled();
  });

  it('runs a one-off check at startup by default', async () => {
    h.updates = { autoCheck: true };
    const scheduler = await load();

    await scheduler.configureAutoCheck();
    expect(h.checkForUpdates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.loggerInfo).not.toHaveBeenCalled();
  });

  it.each([
    ['hourly', 60 * 60 * 1000],
    ['daily', 24 * 60 * 60 * 1000],
    ['weekly', 7 * 24 * 60 * 60 * 1000]
  ])('schedules %s checks after the startup delay', async (interval, ms) => {
    h.updates = { autoCheck: true, checkInterval: interval };
    const scheduler = await load();

    await scheduler.configureAutoCheck();

    expect(h.loggerInfo).toHaveBeenCalledWith('updater', `auto-check scheduled (${interval})`);

    await vi.advanceTimersByTimeAsync(5000);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ms);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('clears an existing interval before rescheduling', async () => {
    h.updates = { autoCheck: true, checkInterval: 'hourly' };
    const scheduler = await load();
    await scheduler.configureAutoCheck();

    await vi.advanceTimersByTimeAsync(5000);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(1);

    await scheduler.configureAutoCheck();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    // Startup z nowej konfiguracji + jeden interwał; stary interwał został wyczyszczony.
    expect(h.checkForUpdates).toHaveBeenCalledTimes(3);
  });

  it('logs store failures', async () => {
    h.getStore.mockRejectedValueOnce(new Error('store'));
    const scheduler = await load();

    await scheduler.configureAutoCheck();

    expect(h.loggerWarn).toHaveBeenCalledWith(
      'updater',
      'configureAutoCheck failed',
      expect.any(Error)
    );
  });

  it('does not overlap running checks', async () => {
    let release!: () => void;
    h.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    h.updates = { autoCheck: true, checkInterval: 'hourly' };
    const scheduler = await load();
    await scheduler.configureAutoCheck();

    await vi.advanceTimersByTimeAsync(5000);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(1);

    release();
    await flush();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(h.checkForUpdates).toHaveBeenCalledTimes(2);
  });
});
