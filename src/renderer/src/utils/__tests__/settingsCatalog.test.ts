import { describe, expect, it } from 'vitest';
import { SETTINGS_CATALOG } from '../settingsCatalog';
import { SETTINGS_TABS } from '../settingsNav';

// Wyszukiwanie ustawień nawiguje po `tab`; literówka albo usunięta zakładka
// zostawiałyby wynik prowadzący donikąd. Test pilnuje, że katalog nie rozjeżdża
// się z listą zakładek.
describe('settings catalog', () => {
  it('points every entry at an existing settings tab', () => {
    const tabIds = new Set<string>(SETTINGS_TABS.map((tab) => tab.id));
    const unknown = SETTINGS_CATALOG.filter((entry) => !tabIds.has(entry.tab)).map(
      (entry) => `${entry.id} -> ${entry.tab}`
    );
    expect(unknown).toEqual([]);
  });

  it('keeps ids unique so search results stay distinguishable', () => {
    const ids = SETTINGS_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
