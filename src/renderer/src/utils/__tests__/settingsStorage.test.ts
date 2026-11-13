import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  warn: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

import { deepMerge, loadSettings, mergeSettings, persistSettings } from '../settingsStorage';

const api = window as unknown as { api?: { invoke: typeof h.invoke } };

function state() {
  return {
    general: ref({ language: 'pl', logLevel: 'info' }),
    appearance: ref({ theme: 'system', fontSize: 14 }),
    playback: ref({}),
    explorer: ref({}),
    library: ref({}),
    download: ref({}),
    shortcuts: ref({}),
    network: ref({}),
    apiKeys: ref({}),
    youtube: ref({}),
    updates: ref({}),
    toast: ref({}),
    dependencies: ref({}),
    statusBar: ref({}),
    home: ref({}),
    favorites: ref<string[]>([])
  };
}

beforeEach(() => {
  h.invoke.mockReset().mockResolvedValue(undefined);
  h.warn.mockClear();
  api.api = { invoke: h.invoke };
});

describe('deepMerge', () => {
  it('returns the base for undefined patches', () => {
    const base = { a: 1 };
    expect(deepMerge(base, undefined)).toBe(base);
  });

  it('recursively keeps default keys missing from the patch', () => {
    const base = { a: 1, nested: { b: 2, c: 3 }, list: [1, 2] };
    const patch = { nested: { c: 9 }, list: [3] };

    expect(deepMerge(base, patch)).toEqual({ a: 1, nested: { b: 2, c: 9 }, list: [3] });
  });

  it('replaces arrays and primitives wholesale', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
    expect(deepMerge('base', 'patch')).toBe('patch');
    expect(deepMerge({ a: 1 }, null)).toBeNull();
  });

  it('ignores undefined values inside a patch', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: undefined })).toEqual({ a: 1, b: 2 });
  });

  it('adds keys missing from the base', () => {
    expect(deepMerge({ a: 1 }, { b: 2, nested: { c: 3 } })).toEqual({
      a: 1,
      b: 2,
      nested: { c: 3 }
    });
  });
});

describe('mergeSettings', () => {
  it('merges known groups and favorites', () => {
    const target = state();

    mergeSettings(target as never, {
      general: { language: 'en' } as never,
      appearance: { fontSize: 18 } as never,
      favorites: ['a', 'b']
    });

    expect(target.general.value).toEqual({ language: 'en', logLevel: 'info' });
    expect(target.appearance.value).toEqual({ theme: 'system', fontSize: 18 });
    expect(target.favorites.value).toEqual(['a', 'b']);
  });

  it('ignores non-object data and missing groups', () => {
    const target = state();

    mergeSettings(target as never, null as never);
    mergeSettings(target as never, { general: undefined } as never);

    expect(target.general.value).toEqual({ language: 'pl', logLevel: 'info' });
  });

  it('does not touch favorites for a non-array value', () => {
    const target = state();
    target.favorites.value = ['keep'];

    mergeSettings(target as never, { favorites: 'nope' } as never);

    expect(target.favorites.value).toEqual(['keep']);
  });
});

describe('loadSettings', () => {
  it('loads and merges persisted settings', async () => {
    h.invoke.mockResolvedValue({ general: { language: 'en' }, favorites: ['x'] });
    const target = state();

    await loadSettings(target as never);

    expect(h.invoke).toHaveBeenCalledWith('settings:get');
    expect(target.general.value.language).toBe('en');
    expect(target.favorites.value).toEqual(['x']);
  });

  it('skips an empty response', async () => {
    h.invoke.mockResolvedValue(null);
    const target = state();

    await loadSettings(target as never);

    expect(target.general.value.language).toBe('pl');
  });

  it('logs load failures and keeps defaults', async () => {
    const error = new Error('ipc down');
    h.invoke.mockRejectedValue(error);
    const target = state();

    await loadSettings(target as never);

    expect(h.warn).toHaveBeenCalledWith(
      'settings',
      'loadSettings failed, falling back to defaults',
      error
    );
    expect(target.general.value.language).toBe('pl');
  });

  it('does nothing without the preload api', async () => {
    api.api = undefined;
    const target = state();

    await loadSettings(target as never);

    expect(h.invoke).not.toHaveBeenCalled();
  });
});

describe('persistSettings', () => {
  it('persists a snapshot of every group', async () => {
    const target = state();
    target.favorites.value = ['a'];

    await persistSettings(target as never);

    expect(h.invoke).toHaveBeenCalledWith(
      'settings:set',
      expect.objectContaining({ general: { language: 'pl', logLevel: 'info' }, favorites: ['a'] })
    );
  });

  it('logs persist failures', async () => {
    const error = new Error('readonly');
    h.invoke.mockRejectedValue(error);

    await persistSettings(state() as never);

    expect(h.warn).toHaveBeenCalledWith('settings', 'persistSettings failed', error);
  });

  it('skips persisting without the preload api', async () => {
    api.api = undefined;

    await persistSettings(state() as never);

    expect(h.invoke).not.toHaveBeenCalled();
  });
});
