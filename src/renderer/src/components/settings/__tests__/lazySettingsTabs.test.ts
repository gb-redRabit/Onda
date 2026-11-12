import { describe, expect, it, vi } from 'vitest';

vi.mock('../SettingsTheme.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsAppearance.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsPlayback.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsPiPVideo.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsPiPAudio.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsSubtitles.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsDownload.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsDownloadPaths.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsDownloadQueue.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsShortcuts.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsNetwork.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsNetworkPlatform.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsUpdates.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsGeneral.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsDiscord.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsSystemLogs.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsToast.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsLibraryFolders.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsExplorer.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsDependencies.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsDiagnostics.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsAbout.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsApiKeys.vue', () => ({ default: { name: 'SettingsTabStub' } }));
vi.mock('../SettingsPlugins.vue', () => ({ default: { name: 'SettingsTabStub' } }));

import { SETTINGS_TAB_COMPONENTS } from '../lazySettingsTabs';

const EXPECTED_TABS = [
  'theme',
  'appearance',
  'playback',
  'pip-video',
  'pip-audio',
  'subtitles',
  'download',
  'download-paths',
  'download-queue',
  'shortcuts',
  'network',
  'network-platform',
  'updates',
  'general',
  'discord',
  'system-logs',
  'toast',
  'library',
  'explorer',
  'dependencies',
  'diagnostics',
  'about',
  'apiKeys',
  'plugins'
];

describe('SETTINGS_TAB_COMPONENTS', () => {
  it('registers a lazy component for every settings tab', () => {
    expect(Object.keys(SETTINGS_TAB_COMPONENTS).sort()).toEqual([...EXPECTED_TABS].sort());

    for (const tab of EXPECTED_TABS) {
      expect(SETTINGS_TAB_COMPONENTS[tab]).toBeTruthy();
    }
  });

  it('creates async component wrappers (not loaded modules)', () => {
    for (const tab of EXPECTED_TABS) {
      const component = SETTINGS_TAB_COMPONENTS[tab] as unknown as {
        __asyncLoader?: () => Promise<unknown>;
        name?: string;
      };
      expect(typeof component.__asyncLoader).toBe('function');
    }
  });

  it('resolves the lazy import for every tab', async () => {
    for (const tab of EXPECTED_TABS) {
      const component = SETTINGS_TAB_COMPONENTS[tab] as unknown as {
        __asyncLoader: () => Promise<unknown>;
      };
      await expect(component.__asyncLoader()).resolves.toBeTruthy();
    }
  });
});
