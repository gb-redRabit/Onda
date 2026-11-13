import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

// Debounce + serialized writer for settings: the newest snapshot must always win,
// even when a slow write is already in flight when reset/import schedules another.

const h = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  persistSettings: vi.fn(),
  mergeSettings: vi.fn()
}));

vi.mock('@renderer/utils/settingsStorage', () => ({
  loadSettings: h.loadSettings,
  persistSettings: h.persistSettings,
  mergeSettings: h.mergeSettings
}));

vi.mock('@renderer/utils/constants', () => ({
  DEFAULT_GENERAL: { section: 'general' },
  DEFAULT_APPEARANCE: { section: 'appearance' },
  DEFAULT_PLAYBACK: { section: 'playback' },
  DEFAULT_EXPLORER: { section: 'explorer' },
  DEFAULT_LIBRARY: { section: 'library' },
  DEFAULT_DOWNLOAD: { section: 'download' },
  DEFAULT_SHORTCUTS: { shortcut: 'Ctrl+K' },
  DEFAULT_NETWORK: { section: 'network' },
  DEFAULT_API_KEYS: { section: 'apiKeys' },
  DEFAULT_YOUTUBE_AUTH: { section: 'youtube' },
  DEFAULT_UPDATES: { section: 'updates' },
  DEFAULT_TOAST: { section: 'toast' },
  DEFAULT_STATUS_BAR: { section: 'statusBar' },
  DEFAULT_HOME: { section: 'home' }
}));

import { createSettingsPersistence, type SettingsState } from '../settings-persist';
import { DEFAULT_GENERAL } from '@renderer/utils/constants';
import type { AppSettings } from '@renderer/types/settings';

function makeState(): SettingsState {
  return {
    general: ref({ section: 'custom' }),
    appearance: ref({ section: 'custom' }),
    playback: ref({ section: 'custom' }),
    explorer: ref({ section: 'custom' }),
    library: ref({ section: 'custom' }),
    download: ref({ section: 'custom' }),
    shortcuts: ref({ shortcut: 'Ctrl+X' }),
    network: ref({ section: 'custom' }),
    apiKeys: ref({ section: 'custom' }),
    youtube: ref({ section: 'custom' }),
    updates: ref({ section: 'custom' }),
    toast: ref({ section: 'custom' }),
    dependencies: ref({ ffmpeg: { installed: true } as never }),
    statusBar: ref({ section: 'custom' }),
    home: ref({ section: 'custom' }),
    favorites: ref(['/a.mp3']),
    isLoaded: ref(false)
  } as unknown as SettingsState;
}

beforeEach(() => {
  h.loadSettings.mockReset().mockResolvedValue(undefined);
  h.persistSettings.mockReset().mockResolvedValue(undefined);
  h.mergeSettings.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('load', () => {
  it('passes the full state to storage and marks settings as loaded', async () => {
    const state = makeState();
    const persistence = createSettingsPersistence(state);

    await persistence.load();

    expect(h.loadSettings).toHaveBeenCalledWith(
      expect.objectContaining({ general: state.general })
    );
    expect(h.loadSettings.mock.calls[0][0]).toMatchObject({ favorites: state.favorites });
    expect(h.loadSettings.mock.calls[0][0]).not.toHaveProperty('isLoaded');
    expect(state.isLoaded.value).toBe(true);
  });
});

describe('save', () => {
  it('coalesces bursts into a single debounced write', async () => {
    vi.useFakeTimers();
    const state = makeState();
    const persistence = createSettingsPersistence(state);

    persistence.save();
    persistence.save();
    await vi.advanceTimersByTimeAsync(299);
    expect(h.persistSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(h.persistSettings).toHaveBeenCalledTimes(1);
    expect(h.persistSettings.mock.calls[0][0].general).toBe(state.general);
  });

  it('writes immediately without waiting for the debounce window', async () => {
    vi.useFakeTimers();
    const persistence = createSettingsPersistence(makeState());

    persistence.saveImmediate();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.persistSettings).toHaveBeenCalledTimes(1);
  });

  it('does not lose a snapshot scheduled while a write is in flight', async () => {
    vi.useFakeTimers();
    const persistence = createSettingsPersistence(makeState());
    let finishFirst!: () => void;
    h.persistSettings
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
      .mockResolvedValue(undefined);

    persistence.saveImmediate();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.persistSettings).toHaveBeenCalledTimes(1);

    persistence.saveImmediate();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.persistSettings).toHaveBeenCalledTimes(1);

    finishFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.persistSettings).toHaveBeenCalledTimes(2);
  });
});

describe('resetToDefaults', () => {
  it('replaces every section with a fresh copy of the defaults', async () => {
    vi.useFakeTimers();
    const state = makeState();
    const persistence = createSettingsPersistence(state);

    persistence.resetToDefaults();

    expect(state.general.value).toEqual({ section: 'general' });
    expect(state.appearance.value).toEqual({ section: 'appearance' });
    expect(state.playback.value).toEqual({ section: 'playback' });
    expect(state.explorer.value).toEqual({ section: 'explorer' });
    expect(state.library.value).toEqual({ section: 'library' });
    expect(state.download.value).toEqual({ section: 'download' });
    expect(state.shortcuts.value).toEqual({ shortcut: 'Ctrl+K' });
    expect(state.network.value).toEqual({ section: 'network' });
    expect(state.apiKeys.value).toEqual({ section: 'apiKeys' });
    expect(state.youtube.value).toEqual({ section: 'youtube' });
    expect(state.updates.value).toEqual({ section: 'updates' });
    expect(state.toast.value).toEqual({ section: 'toast' });
    expect(state.statusBar.value).toEqual({ section: 'statusBar' });
    expect(state.home.value).toEqual({ section: 'home' });
    expect(state.dependencies.value).toEqual({});
    expect(state.favorites.value).toEqual([]);

    await vi.advanceTimersByTimeAsync(300);
    expect(h.persistSettings).toHaveBeenCalledTimes(1);
  });

  it('hands out copies rather than the shared default objects', () => {
    const state = makeState();
    const persistence = createSettingsPersistence(state);

    persistence.resetToDefaults();
    (state.general.value as unknown as { section: string }).section = 'changed';

    expect(DEFAULT_GENERAL).toEqual({ section: 'general' });
  });
});

describe('applyImported', () => {
  it('merges imported settings into the current state and persists', async () => {
    vi.useFakeTimers();
    const state = makeState();
    const persistence = createSettingsPersistence(state);
    const imported = { general: { section: 'imported' } } as unknown as Partial<AppSettings>;

    persistence.applyImported(imported);

    expect(h.mergeSettings).toHaveBeenCalledWith(
      expect.objectContaining({ general: state.general }),
      imported
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(h.persistSettings).toHaveBeenCalledTimes(1);
  });
});
