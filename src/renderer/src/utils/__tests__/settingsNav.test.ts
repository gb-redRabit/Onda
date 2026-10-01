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
    // Zabezpieczenie regresji: zakładka wypadła z nawigacji podczas refaktoru
    // ustawień (257efa3), a komponent pozostał zarejestrowany.
    const tab = SETTINGS_TABS.find((item) => item.id === 'diagnostics');
    expect(tab?.section).toBe('system');
    expect(tab?.labelKey).toBe('settings.diagnostics');
  });

  it('merges system information into diagnostics instead of exposing a duplicate tab', () => {
    expect(SETTINGS_TABS.map((item) => String(item.id))).not.toContain('systemInfo');
    expect('systemInfo' in SETTINGS_TAB_COMPONENTS).toBe(false);
  });
});
