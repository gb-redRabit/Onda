import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Paleta poleceń (Ctrl+K, globalna) i wyszukiwanie widoku (Ctrl+F, bieżący widok).

test.describe('command palette', () => {
  test('Ctrl+K opens the palette and runs an action; Ctrl+F opens view search', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'library');

      // Globalna paleta: puste zapytanie wyświetla każdą akcję widoku.
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('app-search')).toBeVisible();
      await expect(page.getByTestId('app-search-input')).toBeVisible();
      await expect(page.getByTestId('app-search-input')).toBeFocused();
      await expect(page.locator('#app-search-item-0')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('app-search')).toHaveCount(0);

      // Uruchomienie pierwszej akcji (Home) nawiguje i zamyka paletę.
      await page.keyboard.press('Control+k');
      await expect(page.locator('#app-search-item-0')).toBeVisible();
      await page.locator('#app-search-item-0').click();
      await expect(page.getByTestId('app-search')).toHaveCount(0);
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'home');

      // Wyszukiwanie widoku Ctrl+F w widoku z wyszukiwaniem (brak globalnej listy wyników).
      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.keyboard.press('Control+f');
      await expect(page.getByTestId('app-search')).toBeVisible();
      await expect(page.getByTestId('app-search-input')).toBeFocused();
      await expect(page.locator('#app-search-results')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('app-search')).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
