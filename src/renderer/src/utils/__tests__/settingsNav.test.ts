import { describe, expect, it } from 'vitest';
import { SETTINGS_TABS } from '../settingsNav';
import { SETTINGS_TAB_COMPONENTS } from '@renderer/components/settings/lazySettingsTabs';

describe('settings navigation', () => {
  it('maps every tab to a lazy component', () => {
    const missing = SETTINGS_TABS.map((tab) => tab.id).filter(
      (id) => !(id in SETTINGS_TAB_COMPONENTS)
    );
    expect(missing).toEqual([]);
  });

  it('keeps the diagnostics tab reachable', () => {
    // Regression guard: the tab was dropped from the nav during the settings
    // refactor (257efa3) while the component stayed registered.
    const tab = SETTINGS_TABS.find((item) => item.id === 'diagnostics');
    expect(tab?.section).toBe('system');
    expect(tab?.labelKey).toBe('settings.diagnostics');
  });
});
