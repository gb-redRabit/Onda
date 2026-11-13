import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindSettingsStore,
  currentOf,
  defaultOf,
  isSettingModified,
  resetSetting
} from '../settingsDefaults';
import {
  DEFAULT_API_KEYS,
  DEFAULT_APPEARANCE,
  DEFAULT_DOWNLOAD,
  DEFAULT_EXPLORER,
  DEFAULT_GENERAL,
  DEFAULT_HOME,
  DEFAULT_LIBRARY,
  DEFAULT_NETWORK,
  DEFAULT_PLAYBACK,
  DEFAULT_STATUS_BAR,
  DEFAULT_TOAST,
  DEFAULT_UPDATES
} from '@renderer/utils/constants';

function fakeStore() {
  const bags: Record<string, Record<string, unknown>> = {
    playback: { defaultVolume: 0.8, gaplessPlayback: true },
    appearance: { animations: true }
  };
  const updatePlayback = vi.fn((patch: Record<string, unknown>) =>
    Object.assign(bags.playback, patch)
  );
  const updateAppearance = vi.fn((patch: Record<string, unknown>) =>
    Object.assign(bags.appearance, patch)
  );
  return {
    bags,
    updatePlayback,
    updateAppearance,
    // Helper czyta stan przez `$state`, gdzie trzyma go prawdziwy store Pinia.
    // Udostępnianie worków bezpośrednio odzwierciedla też sposób, w jaki Pinia
    // odwija stan na store, więc to pozostaje wiernym zaślepkiem.
    $state: bags,
    ...bags
  };
}

let store: ReturnType<typeof fakeStore>;

beforeEach(() => {
  store = fakeStore();
  bindSettingsStore(store as never);
});

describe('settingsDefaults', () => {
  it('reads the shipped default for a path', () => {
    expect(defaultOf('playback.defaultVolume')).toBe(0.8);
    expect(defaultOf('appearance.animations')).toBe(true);
    expect(defaultOf('playback.doesNotExist')).toBeUndefined();
  });

  it('detects values that differ from the default', () => {
    expect(isSettingModified('playback.defaultVolume')).toBe(false);

    store.bags.playback.defaultVolume = 0.5;
    expect(isSettingModified('playback.defaultVolume')).toBe(true);
  });

  it('ignores unknown paths', () => {
    expect(isSettingModified('playback.nope')).toBe(false);
  });

  it('resets a single setting through the right updater', () => {
    store.bags.playback.defaultVolume = 0.2;
    store.bags.appearance.animations = false;

    resetSetting('playback.defaultVolume');
    resetSetting('appearance.animations');

    expect(store.updatePlayback).toHaveBeenCalledWith({ defaultVolume: 0.8 });
    expect(store.updateAppearance).toHaveBeenCalledWith({ animations: true });
    expect(isSettingModified('playback.defaultVolume')).toBe(false);
    expect(isSettingModified('appearance.animations')).toBe(false);
  });

  it('exposes the current value for the tooltip', () => {
    expect(currentOf('playback.defaultVolume')).toBe(0.8);
  });
});

const GROUP_DEFAULTS = {
  general: DEFAULT_GENERAL,
  appearance: DEFAULT_APPEARANCE,
  playback: DEFAULT_PLAYBACK,
  explorer: DEFAULT_EXPLORER,
  library: DEFAULT_LIBRARY,
  download: DEFAULT_DOWNLOAD,
  network: DEFAULT_NETWORK,
  updates: DEFAULT_UPDATES,
  toast: DEFAULT_TOAST,
  statusBar: DEFAULT_STATUS_BAR,
  home: DEFAULT_HOME
} as const;

const UPDATER_NAME: Record<keyof typeof GROUP_DEFAULTS, string> = {
  general: 'updateGeneral',
  appearance: 'updateAppearance',
  playback: 'updatePlayback',
  explorer: 'updateExplorer',
  library: 'updateLibrary',
  download: 'updateDownload',
  network: 'updateNetwork',
  updates: 'updateUpdates',
  toast: 'updateToast',
  statusBar: 'updateStatusBar',
  home: 'updateHome'
};

function fullStore(): {
  bags: Record<string, Record<string, unknown>>;
  $state: Record<string, Record<string, unknown>>;
} & Record<string, ReturnType<typeof vi.fn>> {
  const bags: Record<string, Record<string, unknown>> = {
    apiKeys: { keys: [...DEFAULT_API_KEYS.keys] }
  };
  for (const [group, defaults] of Object.entries(GROUP_DEFAULTS)) {
    bags[group] = { ...(defaults as Record<string, unknown>) };
  }
  const updaters = Object.fromEntries(
    Object.values(UPDATER_NAME).map((name) => [name, vi.fn()])
  ) as Record<string, ReturnType<typeof vi.fn>>;
  return { bags, ...updaters, $state: bags } as never;
}

describe('settingsDefaults groups', () => {
  it('routes every updatable group to its store action', () => {
    const store = fullStore();
    bindSettingsStore(store as never);

    for (const [group, defaults] of Object.entries(GROUP_DEFAULTS)) {
      const field = Object.keys(defaults)[0]!;
      resetSetting(`${group}.${field}`);
      expect(store[UPDATER_NAME[group as keyof typeof GROUP_DEFAULTS]]).toHaveBeenCalledWith({
        [field]: (defaults as Record<string, unknown>)[field]
      });
    }
  });

  it('compares object settings structurally', () => {
    const store = fullStore();
    bindSettingsStore(store as never);

    expect(isSettingModified('apiKeys.keys')).toBe(false);
    store.bags.apiKeys.keys = ['abc'];
    expect(isSettingModified('apiKeys.keys')).toBe(true);
  });

  it('ignores missing defaults and groups without an updater', () => {
    const store = fullStore();
    bindSettingsStore(store as never);

    expect(() => resetSetting('apiKeys.nope')).not.toThrow();
    expect(() => resetSetting('apiKeys.keys')).not.toThrow();
    expect(store.updateGeneral).not.toHaveBeenCalled();
  });

  it('throws when no settings store has been bound', async () => {
    vi.resetModules();
    const fresh = await import('../settingsDefaults');

    expect(fresh.defaultOf('general.autoLaunch')).toBe(false);
    expect(() => fresh.currentOf('general.autoLaunch')).toThrow('settings store not bound');
  });
});
