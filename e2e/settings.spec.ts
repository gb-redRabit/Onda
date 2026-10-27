import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Pokrycie interakcji dla powłoki Settings: nawigacja rail, wyszukiwanie ustawień,
// menu przepełnienia i potwierdzenie resetu. Akcje destrukcyjne (import /
// factory reset) nigdy nie są tutaj potwierdzane — weryfikowane jest tylko ich okablowanie.

test.describe('settings interactions', () => {
  test('navigates the rail, searches settings and opens the reset confirmation', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/settings';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');

      // Rail: sekcja przeskakuje do swojej pierwszej zakładki.
      await onda.page.getByTestId('settings-section-appearance').click();
      await onda.page.waitForFunction(() => window.location.hash.includes('tab=theme'));
      await expect(onda.page.getByTestId('settings-tab-theme')).toHaveAttribute(
        'aria-current',
        'page'
      );

      // Konkretną zakładkę można wybrać bezpośrednio.
      await onda.page.getByTestId('settings-section-playback').click();
      await onda.page.waitForFunction(() => window.location.hash.includes('tab=playback'));

      // Wyszukiwanie zawęża do trafień, a Enter otwiera pierwsze trafienie. Zapytanie jest
      // wyprowadzane z widocznej etykiety zakładki, więc test jest niezależny od lokalizacji.
      await onda.page.getByTestId('settings-section-advanced').click();
      const pluginsTab = onda.page.getByTestId('settings-tab-plugins');
      const tabLabel = (await pluginsTab.innerText()).trim();
      const query = tabLabel.split(/\s+/)[0];

      const search = onda.page.getByTestId('settings-search');
      await search.click();
      await search.fill(query);
      await expect(onda.page.getByTestId('settings-search-hit').first()).toBeVisible();
      await search.press('Enter');
      await onda.page.waitForFunction(() => window.location.hash.includes('tab='));
      await expect(onda.page.getByTestId('settings-search-hit')).toHaveCount(0);

      // Menu przepełnienia eksponuje eksport / import / reset bez ich uruchamiania.
      await onda.page.getByTestId('settings-more').click();
      await expect(onda.page.getByTestId('settings-menu')).toBeVisible();
      await expect(onda.page.getByTestId('settings-export')).toBeVisible();
      await expect(onda.page.getByTestId('settings-import')).toBeVisible();
      await expect(onda.page.getByTestId('settings-reset-menu')).toBeVisible();
      await onda.page.getByTestId('settings-more').click();
      await expect(onda.page.getByTestId('settings-menu')).toHaveCount(0);

      // Reset prosi o potwierdzenie, a anulowanie utrzymuje aplikację przy życiu.
      await onda.page.getByTestId('settings-reset').click();
      const confirmDialog = onda.page.getByTestId('explorer-prompt-dialog');
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole('button', { name: /cancel|anuluj/i }).click();
      await expect(confirmDialog).toHaveCount(0);
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  // Tryb kompaktowy musi być znajdowalny w wyszukiwaniu ustawień (wcześniej brak
  // wpisu w katalogu powodował, że wpisanie "kompakt" nic nie pokazywało).
  test('finds and toggles compact startup from settings search', async () => {
    const onda = await launchOnda();
    try {
      const page = onda.page;
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/settings';
      });

      const search = page.getByTestId('settings-search');
      await search.fill('compact');
      const hit = page
        .getByTestId('settings-search-hit')
        .filter({ hasText: /kompakt|compact/i })
        .first();
      await expect(hit).toBeVisible();
      await hit.click();

      const toggle = page.getByTestId('settings-compact-startup');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const api = (window as unknown as { api: { invoke: (c: string) => Promise<unknown> } })
              .api;
            return api.invoke('app:getStartupMode');
          })
        )
        .toBe('compact');

      // Przywróć tryb main w profilu testowym — kolejne przebiegi mają startować normalnie.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const api = (window as unknown as { api: { invoke: (c: string) => Promise<unknown> } })
              .api;
            return api.invoke('app:getStartupMode');
          })
        )
        .toBe('main');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
