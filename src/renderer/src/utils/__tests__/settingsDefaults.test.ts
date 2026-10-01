import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindSettingsStore,
  currentOf,
  defaultOf,
  isSettingModified,
  resetSetting
} from '../settingsDefaults';

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
    // The helper reads state through `$state`, which is where a real Pinia store
    // keeps it. Exposing the bags directly as well mirrors how Pinia unwraps
    // state onto the store, so this stays a faithful stand-in.
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
