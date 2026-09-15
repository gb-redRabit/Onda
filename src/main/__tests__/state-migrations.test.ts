import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '' } }));

import {
  CURRENT_STORE_VERSION,
  STORE_MIGRATIONS,
  STORE_VERSION_KEY,
  runFileMigrations,
  runStoreMigrations
} from '../state-migrations';
import type { Store } from '../ipc/cover-store';

interface FakeStore extends Store {
  data: Record<string, unknown>;
}

function fakeStore(initial: Record<string, unknown> = {}): FakeStore {
  const data = { ...initial };
  return {
    data,
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    }
  } as unknown as FakeStore;
}

describe('runStoreMigrations', () => {
  it('migrates the legacy audio-PiP appearance and records the schema version', async () => {
    const store = fakeStore({
      appearance: { accentColor: '#ff8800', audioPipMode: 'wide', audioPipEdgePosition: 'top' }
    });

    await runStoreMigrations(store);

    expect(store.data[STORE_VERSION_KEY]).toBe(CURRENT_STORE_VERSION);
    const appearance = store.data.appearance as Record<string, unknown>;
    expect(appearance.audioPipDock).toBe('top');
    expect(appearance.audioPipAutoHide).toBe(true);
    expect((appearance.customColors as Record<string, unknown>).primary).toBe('#ff8800');
  });

  it('leaves a store without appearance untouched but still stamps the version', async () => {
    const store = fakeStore();

    await runStoreMigrations(store);

    expect(store.data.appearance).toBeUndefined();
    expect(store.data[STORE_VERSION_KEY]).toBe(CURRENT_STORE_VERSION);
  });

  it('skips migrations that are not above the stored version', async () => {
    const migrate = vi.fn();
    const store = fakeStore({ [STORE_VERSION_KEY]: CURRENT_STORE_VERSION });

    await runStoreMigrations(store, [{ version: CURRENT_STORE_VERSION, name: 'current', migrate }]);

    expect(migrate).not.toHaveBeenCalled();
  });

  it('runs pending migrations in ascending version order', async () => {
    const calls: number[] = [];
    const store = fakeStore({ [STORE_VERSION_KEY]: 1 });

    await runStoreMigrations(store, [
      { version: 3, name: 'three', migrate: () => calls.push(3) },
      { version: 2, name: 'two', migrate: () => calls.push(2) }
    ]);

    expect(calls).toEqual([2, 3]);
    expect(store.data[STORE_VERSION_KEY]).toBe(3);
  });

  it('keeps CURRENT_STORE_VERSION in sync with the registered migrations', () => {
    const last = STORE_MIGRATIONS.at(-1);
    expect(last?.version).toBe(CURRENT_STORE_VERSION);
  });
});

describe('runFileMigrations', () => {
  it('stops at the first migration that rewrites the store file', async () => {
    const calls: string[] = [];

    const key = await runFileMigrations('unused-key-path', [
      {
        name: 'first',
        run: async () => {
          calls.push('first');
          return null;
        }
      },
      {
        name: 'second',
        run: async () => {
          calls.push('second');
          return 'new-key';
        }
      },
      {
        name: 'third',
        run: async () => {
          calls.push('third');
          return 'another-key';
        }
      }
    ]);

    expect(calls).toEqual(['first', 'second']);
    expect(key).toBe('new-key');
  });

  it('returns null when no file migration applies', async () => {
    const key = await runFileMigrations('unused-key-path', [
      { name: 'noop', run: async () => null }
    ]);
    expect(key).toBeNull();
  });
});
