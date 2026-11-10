import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:/user'),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({ app: { getPath: state.getPath } }));
vi.mock('fs/promises', () => ({
  readFile: state.readFile,
  writeFile: state.writeFile,
  mkdir: state.mkdir
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  return import('../compact-state');
}

const FILE = join('C:/user', 'compact-window-state.json');

function setStored(value: unknown) {
  state.readFile.mockResolvedValue(JSON.stringify(value));
}

beforeEach(() => {
  state.readFile.mockReset();
  state.readFile.mockRejectedValue(new Error('ENOENT'));
  state.writeFile.mockReset();
  state.writeFile.mockResolvedValue(undefined);
  state.mkdir.mockReset();
  state.mkdir.mockResolvedValue(undefined);
  state.loggerWarn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('defaults to main mode without a file', async () => {
    const store = await load();

    await expect(store.loadCompactState()).resolves.toEqual({ mode: 'main' });
    expect(store.compactStateSync()).toEqual({ mode: 'main' });
  });

  it('loads and validates a stored state', async () => {
    setStored({
      mode: 'compact',
      bounds: { x: 10.4, y: 20.6, width: 500, height: 700 },
      alwaysOnTop: true,
      restoreSessionOnce: true
    });
    const store = await load();

    await expect(store.loadCompactState()).resolves.toEqual({
      mode: 'compact',
      bounds: { x: 10, y: 21, width: 500, height: 700 },
      alwaysOnTop: true,
      restoreSessionOnce: true
    });
  });

  it('drops invalid fields', async () => {
    setStored({
      mode: 'other',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      alwaysOnTop: 'yes',
      restoreSessionOnce: false
    });
    const store = await load();

    await expect(store.loadCompactState()).resolves.toEqual({ mode: 'main' });
  });

  it('rejects non-object or non-finite bounds', async () => {
    for (const bounds of [
      null,
      'nope',
      { x: 'a', y: 0, width: 500, height: 600 },
      { x: 0, y: 0, width: 500 }
    ]) {
      setStored({ mode: 'compact', bounds });
      const store = await load();
      await expect(store.loadCompactState()).resolves.toEqual({ mode: 'compact' });
    }
  });

  it('caches the loaded state', async () => {
    setStored({ mode: 'compact' });
    const store = await load();

    const first = await store.loadCompactState();
    const second = await store.loadCompactState();

    expect(second).toBe(first);
    expect(state.readFile).toHaveBeenCalledTimes(1);
  });
});

describe('saving', () => {
  it('merges the patch and writes atomically', async () => {
    setStored({ mode: 'main', alwaysOnTop: false });
    const store = await load();

    await store.saveCompactState({
      mode: 'compact',
      bounds: { x: 1, y: 2, width: 400, height: 600 }
    });

    expect(state.mkdir).toHaveBeenCalledWith(join('C:/user'), { recursive: true });
    expect(state.writeFile).toHaveBeenCalledWith(
      FILE,
      JSON.stringify({
        mode: 'compact',
        alwaysOnTop: false,
        bounds: { x: 1, y: 2, width: 400, height: 600 }
      }),
      'utf-8'
    );
    expect(store.compactStateSync()).toMatchObject({ mode: 'compact' });
  });

  it('drops invalid bounds from the patch', async () => {
    const store = await load();
    await store.saveCompactState({ bounds: { x: 0, y: 0, width: 100, height: 100 } });

    const written = JSON.parse(state.writeFile.mock.calls[0][1]);
    expect(written).toEqual({ mode: 'main', bounds: undefined });
    expect(store.compactStateSync().bounds).toBeUndefined();
  });

  it('keeps existing fields when only mode changes', async () => {
    setStored({ mode: 'main', bounds: { x: 0, y: 0, width: 420, height: 640 } });
    const store = await load();

    await store.saveCompactState({ mode: 'compact' });

    expect(JSON.parse(state.writeFile.mock.calls[0][1])).toMatchObject({
      mode: 'compact',
      bounds: { x: 0, y: 0, width: 420, height: 640 }
    });
  });

  it('logs write failures and keeps the previous state', async () => {
    setStored({ mode: 'main' });
    state.writeFile.mockRejectedValueOnce(new Error('disk'));
    const store = await load();
    await store.loadCompactState();

    await store.saveCompactState({ mode: 'compact' });

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'compact',
      'saving compact state failed',
      expect.any(Error)
    );
    expect(store.compactStateSync().mode).toBe('main');
  });

  it('serializes concurrent saves', async () => {
    const store = await load();
    let active = 0;
    let maxActive = 0;
    state.writeFile.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
    });

    await Promise.all([
      store.saveCompactState({ mode: 'compact' }),
      store.saveCompactState({ mode: 'main' })
    ]);

    expect(maxActive).toBe(1);
    expect(state.writeFile).toHaveBeenCalledTimes(2);
  });
});
